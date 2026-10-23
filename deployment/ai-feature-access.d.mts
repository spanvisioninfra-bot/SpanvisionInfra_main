export interface AiFeatureAccess {available:boolean;checking:boolean;message:string}
export const aiComingSoonMessage:string;
export const aiChecking:AiFeatureAccess;
export function getAiFeatureAccess():Promise<AiFeatureAccess>;
export function requireAiFeature():Promise<void>;
export function subscribeAiFeature(listener:(state:AiFeatureAccess)=>void):()=>void;
