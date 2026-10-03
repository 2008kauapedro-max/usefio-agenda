export type ImagePreset='avatar'|'feed'|'logo'|'cover'|'background';

const PRESETS:Record<ImagePreset,{maxWidth:number;maxHeight:number;quality:number}>={
 avatar:{maxWidth:512,maxHeight:512,quality:.82},
 feed:{maxWidth:1600,maxHeight:1600,quality:.82},
 logo:{maxWidth:900,maxHeight:900,quality:.9},
 cover:{maxWidth:1800,maxHeight:1200,quality:.82},
 background:{maxWidth:1800,maxHeight:1800,quality:.8}
};

const allowed=new Set(['image/jpeg','image/png','image/webp']);

function canvasBlob(canvas:HTMLCanvasElement,quality:number){
 return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Não foi possível preparar a imagem.')),'image/webp',quality));
}

async function loadBitmap(file:File){
 if('createImageBitmap' in window)return createImageBitmap(file,{imageOrientation:'from-image'});
 const url=URL.createObjectURL(file);
 try{
  const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=()=>reject(new Error('Não foi possível abrir a imagem.'));el.src=url;});
  return image;
 }finally{URL.revokeObjectURL(url);}
}

export async function optimizeImage(file:File,preset:ImagePreset){
 if(!allowed.has(file.type))throw new Error('Use uma imagem JPG, PNG ou WebP.');
 if(file.size>15*1024*1024)throw new Error('A imagem original pode ter no máximo 15 MB.');
 const cfg=PRESETS[preset],source=await loadBitmap(file);
 const width='naturalWidth' in source?source.naturalWidth:source.width;
 const height='naturalHeight' in source?source.naturalHeight:source.height;
 if(!width||!height)throw new Error('A imagem selecionada é inválida.');
 const scale=Math.min(1,cfg.maxWidth/width,cfg.maxHeight/height);
 const outWidth=Math.max(1,Math.round(width*scale)),outHeight=Math.max(1,Math.round(height*scale));
 const canvas=document.createElement('canvas');canvas.width=outWidth;canvas.height=outHeight;
 const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)throw new Error('Não foi possível preparar a imagem.');
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source as CanvasImageSource,0,0,outWidth,outHeight);
 if('close' in source&&typeof source.close==='function')source.close();
 const blob=await canvasBlob(canvas,cfg.quality);
 const base=file.name.replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]+/gi,'-').slice(0,60)||'imagem';
 return new File([blob],`${base}.webp`,{type:'image/webp',lastModified:Date.now()});
}
