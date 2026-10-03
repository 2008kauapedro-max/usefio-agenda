export const AI_SCOPE_REPLY = 'Posso ajudar apenas com o FIO e com as informações e funções disponíveis no seu acesso.';

export function normalizeAIText(value:string){
 return value.normalize('NFKC').toLocaleLowerCase('pt-BR').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\s+/g,' ').trim();
}

export function looksLikePromptAttack(value:string){
 const q=normalizeAIText(value);
 return [
  /\b(ignore|ignora|ignorar|desconsidere|esque[cç]a|bypass|jailbreak|developer mode|modo desenvolvedor|dan mode)\b.{0,100}\b(instru[cç][oõ]es|regras|prompt|sistema|system|developer|restri[cç][oõ]es|pol[ií]tica)/i,
  /\b(system|developer|assistant)\s*:/i,
  /\b(revele|mostre|exiba|imprima|repita|vaze|leak|extract)\b.{0,100}\b(prompt|system|developer|instru[cç][oõ]es|segredo|secret|token|api.?key|chave|senha|env|vari[aá]veis)/i,
  /\b(fin[jj]a|simule|roleplay|interprete|aja como|act as|pretend)\b.{0,100}\b(admin|administrador|owner|dono|platform|platform_admin|sistema|developer|root)/i,
  /\b(elevar|escale|escalar|trocar|mudar|assumir|forjar)\b.{0,100}\b(cargo|role|permiss[aã]o|acesso|admin|owner|platform)/i,
  /\b(base64|rot13|hexadecimal|unicode|codifique|decodifique|decode|encode)\b.{0,140}\b(prompt|instru[cç][aã]o|system|developer|segredo|token|chave)/i,
  /\b(select\s+\*|information_schema|pg_catalog|service_role|service role|supabase_service_role_key|ai_api_key|process\.env)\b/i,
  /<\s*(system|developer|assistant|tool)\b/i
 ].some(p=>p.test(q));
}

export function clearlyGenericAIRequest(value:string){
 const q=normalizeAIText(value);
 const fio=/\b(fio|barbear|corte|barba|agenda|agend|hor[aá]rio|atendimento|cliente|servi[cç]o|pre[cç]o|profissional|barbeiro|funcion[aá]rio|equipe|assinatura|plano|receita|fatur|receb|pagamento|perfil|whatsapp|avalia[cç][aã]o|feed|app|notifica[cç][aã]o|alerta)\b/i.test(q);
 if(fio)return false;
 return [
  /\b(crie|fa[cç]a|escreva|gere|monte|desenvolva|programe)\b.{0,90}\b(site|landing page|c[oó]digo|script|programa|reda[cç][aã]o|trabalho escolar|poema|hist[oó]ria|curr[ií]culo|email|e-mail)\b/i,
  /\b(python|javascript|typescript|react|next\.?js|java|c\+\+|php|html|css|programa[cç][aã]o)\b/i,
  /\b(resolve|resolva|calcule)\b.{0,70}\b(equa[cç][aã]o|integral|derivada|exerc[ií]cio|prova)\b/i,
  /\b(traduza|translate)\b/i
 ].some(p=>p.test(q));
}

export function safeAIOutput(value:string,fallback=AI_SCOPE_REPLY){
 const text=value.trim().slice(0,8000);
 const leak=/\b(system prompt|developer message|service[_ -]?role|api[_ -]?key|sb_secret_|bearer\s+[a-z0-9._-]+|supabase_service_role_key|ai_api_key|process\.env|information_schema|pg_catalog)\b/i;
 return leak.test(text)?fallback:text;
}
