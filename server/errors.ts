export class ApiError extends Error {
 constructor(public status: number, public code: string, message: string) { super(message); }
}
const errors: Record<string, [number, string]> = {
 CLIENT_ALREADY_BOOKED:[409,'Você já tem um atendimento nesse horário. Escolha outro.'],
 NO_ACTIVE_SUBSCRIPTION:[409,'O pacote não está disponível para esse horário. Revise sua escolha.'],
 PLAN_CAPACITY: [409, 'O limite deste plano foi atingido. Desative um item existente ou escolha um plano com mais capacidade.'],
 INVALID_PHONE: [400, 'Informe um telefone válido.'],
 PHONE_ALREADY_IN_USE: [409, 'Este telefone já está vinculado a outra conta FIO. Entre com a conta existente ou use outro número.'],
 FORBIDDEN: [403, 'Você não tem permissão para esta ação.'], AUTH_REQUIRED: [401, 'Entre novamente para continuar.'],
 PLAN_REQUIRED: [403, 'Este recurso não está disponível no plano atual da barbearia.'],
 DAILY_LIMIT: [429, 'Você atingiu o limite diário do Assistente. Tente amanhã.'], RATE_LIMIT: [429, 'Muitas mensagens. Aguarde um minuto.'],
 SLOT_UNAVAILABLE: [409, 'Este horário acabou de ser ocupado. Escolha outro.'], INVALID_TIME: [400, 'Escolha um horário futuro dentro dos próximos 60 dias.'],
 OUTSIDE_BUSINESS_HOURS: [400, 'Horário fora do expediente.'], INVALID_TRANSITION: [409, 'Este atendimento já foi atualizado.'],
 CANCELLATION_WINDOW: [409, 'Cancelamentos e remarcações pelo aplicativo exigem duas horas de antecedência. Entre em contato com a barbearia.'],
 TOO_EARLY: [409, 'Aguarde o início do atendimento para concluir.'], INVALID_INVITATION: [400, 'Convite inválido, utilizado ou expirado.'],
 OWNER_SHOP_LIMIT: [409, 'Sua conta já possui uma barbearia.'], SHOP_NOT_FOUND: [404, 'Barbearia não encontrada.'],
 INVALID_APPOINTMENT: [400, 'Este atendimento não está disponível para esta ação.'],
 INVALID_BARBER: [400, 'Profissional indisponível.'], INVALID_SERVICE: [400, 'Serviço indisponível.'], INVALID_SERVICE_OR_BARBER: [400, 'Serviço ou profissional indisponível.']
 ,SLUG_TAKEN: [409, 'Este link já está em uso. Escolha outro.']
 ,INVALID_SLUG: [400, 'Use apenas letras minúsculas, números e hífens no link.']
 ,INVALID_ACCENT_COLOR: [400, 'Escolha uma cor válida.']
 ,ONBOARDING_INCOMPLETE: [400, 'Complete os campos obrigatórios antes de ativar.']
 ,TRIAL_ALREADY_USED: [409, 'Esta barbearia já utilizou o teste grátis do FIO PRO.']
 ,TRIAL_NOT_AVAILABLE: [409, 'O teste grátis não está disponível para esta assinatura.']
};
export function dbError(error: { message: string; code?: string } | null) {
 if (!error) return;
 for (const [code,[status,message]] of Object.entries(errors)) if (error.message.includes(code)) throw new ApiError(status,code,message);
 if(error.code==='23505') throw new ApiError(409,'DUPLICATE','Este registro já existe. Confira os dados e tente novamente.');
 if(error.code==='42501') throw new ApiError(403,'FORBIDDEN','Você não tem permissão para esta ação.');
 if(error.code==='23503'||error.code==='23514'||error.code==='22023') throw new ApiError(400,'INVALID_DATA','Confira os dados informados.');
 throw new ApiError(503,'DATABASE_UNAVAILABLE','Não foi possível acessar os dados. Tente novamente.');
}

