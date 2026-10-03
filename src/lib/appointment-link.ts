// Accept only the scheduling destination, never arbitrary redirects.
export function appointmentLink(value:string|null){
 if(!value)return null;
 try{const u=new URL(value,'https://fio.invalid');if(u.origin!=='https://fio.invalid'||!/^\/(owner|barber|client)\/agenda$/.test(u.pathname))return null;const id=u.searchParams.get('appointment'),shop=u.searchParams.get('shopId'),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;if(!id||!shop||!uuid.test(id)||!uuid.test(shop))return null;return `${u.pathname}?appointment=${id}&shopId=${shop}`;}catch{return null;}
}
