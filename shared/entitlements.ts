import type { Plan } from './domain.js';

export type FioFeature='assistant'|'feed'|'communication'|'client_plans'|'custom_branding';

export const FIO_FEATURES:Record<Plan,Record<FioFeature,boolean>>={
 FREE:{assistant:false,feed:false,communication:false,client_plans:false,custom_branding:false},
 PRO:{assistant:true,feed:true,communication:true,client_plans:true,custom_branding:true},
 PLUS:{assistant:true,feed:true,communication:true,client_plans:true,custom_branding:true},
 PREMIUM:{assistant:true,feed:true,communication:true,client_plans:true,custom_branding:true}
};

export function planAllows(plan:Plan,feature:FioFeature){return Boolean(FIO_FEATURES[plan]?.[feature]);}