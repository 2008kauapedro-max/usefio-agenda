export type InAppBrowser='Instagram'|'Facebook'|null;
export function detectInAppBrowser(ua:string):InAppBrowser {
 if(/Instagram/i.test(ua))return 'Instagram';
 if(/FBAN\/|FBAV\/|\bFB_IAB\b/i.test(ua))return 'Facebook';
 return null;
}
export const dismissalKey='fio-in-app-dismissed-v1';
export function isDismissed(value:string|null,now=Date.now()){const until=Number(value);return Number.isFinite(until)&&until>now&&until<=now+86400000;}
export function externalBrowserUrl(current:string){const url=new URL(current);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Invalid URL');return url.href;}
export function browserInstructions(ua:string){return /iPhone|iPad|iPod/i.test(ua)?'Use o menu do Instagram/Facebook e escolha Abrir no navegador ou Safari.':'Use ⋮ e escolha Abrir no Chrome ou no navegador.';}
export function mayOfferInstall(ua:string,standalone:boolean){return !standalone&&!detectInAppBrowser(ua);}
