import type { NextFunction, Request, Response } from 'express';
import { isIP } from 'node:net';
import { ApiError } from './errors.js';

type Options={windowMs:number;max:number;key?:(req:Request,res:Response)=>string};
type Bucket={count:number;resetAt:number};
const MAX_BUCKETS=10_000;

export function clientIp(req:Request){
 // Only trust the header supplied by Vercel when actually running on Vercel.
 const forwarded=process.env.VERCEL==='1'?req.headers['x-vercel-forwarded-for']:undefined;
 const value=(Array.isArray(forwarded)?forwarded[0]:forwarded)?.split(',')[0]?.trim();
 const address=value&&isIP(value)?value:(req.socket.remoteAddress||'unknown');
 return address.startsWith('::ffff:')?address.slice(7):address;
}

function trim(buckets:Map<string,Bucket>,now:number){
 if(buckets.size<MAX_BUCKETS)return;
 for(const [key,bucket] of buckets)if(bucket.resetAt<=now)buckets.delete(key);
 while(buckets.size>=MAX_BUCKETS){const oldest=buckets.keys().next().value;if(!oldest)break;buckets.delete(oldest);}
}

export function rateLimit(scope:string,options:Options){
 const buckets=new Map<string,Bucket>();
 return (req:Request,res:Response,next:NextFunction)=>{
  const now=Date.now();trim(buckets,now);
  const identity=(options.key??clientIp)(req,res)||'unknown';
  const key=`${scope}:${identity}`;
  let bucket=buckets.get(key);
  if(!bucket||bucket.resetAt<=now){bucket={count:0,resetAt:now+options.windowMs};buckets.set(key,bucket);}
  bucket.count+=1;
  const retryAfter=Math.max(1,Math.ceil((bucket.resetAt-now)/1000));
  res.setHeader('RateLimit-Limit',String(options.max));
  res.setHeader('RateLimit-Remaining',String(Math.max(0,options.max-bucket.count)));
  res.setHeader('RateLimit-Reset',String(Math.ceil(bucket.resetAt/1000)));
  if(bucket.count>options.max){res.setHeader('Retry-After',String(retryAfter));next(new ApiError(429,'RATE_LIMIT','Muitas tentativas. Aguarde um momento e tente novamente.'));return;}
  next();
 };
}

export const rateLimitByUser=(scope:string,windowMs:number,max:number)=>rateLimit(scope,{windowMs,max,key:(_req,res)=>String(res.locals.auth?.userId??'unknown')});
