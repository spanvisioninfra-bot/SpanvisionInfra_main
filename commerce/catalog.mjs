// Existing Studio/Team prices retained for the approved trial-to-paid policy.
export const toolIds=Object.freeze(['cad','cad2d','bim','pdf','ifc','calc','planner','fem','frame','calculation','geo','speech','stl','field','pointcloud','pile']);
export const trialComingSoonTools=Object.freeze(['bim','stl','fem']);
export const trialToolIds=Object.freeze(toolIds.filter(id=>!trialComingSoonTools.includes(id)));
export const trialComingSoonMessage='Coming soon. This tool is not included in the trial.';
export const aiFeatures=Object.freeze({
  cad:'External AI connection',cad2d:'AI drawing commands',pdf:'AI document assistant',
  calc:'AI estimating assistant',planner:'External AI planning connection',
  fem:'External AI engineering connection',frame:'AI frame assistant',
  geo:'External AI geotechnical connection',speech:'AI speech recognition',pile:'External AI pile planning connection',
});
export const aiComingSoonMessage='AI features — Coming soon for trial users. You can continue using the regular tool features.';
export function toolFeatures(tool,source){
  const available=['subscription','admin','super_admin'].includes(source);
  return aiFeatures[tool]?{ai:{label:aiFeatures[tool],available,status:available?'requires_configuration':'coming_soon',message:available?'An AI provider or supported local model must be configured.':aiComingSoonMessage}}:{};
}
export const trialPolicy=Object.freeze({days:2,hours:48,dailyLimit:3,scope:'trial_tools',starts:'first_launch',reset:'every_24_hours_from_first_launch',availableTools:trialToolIds,comingSoonTools:trialComingSoonTools,comingSoonFeatures:{ai:Object.keys(aiFeatures)}});
export const regions=[
  {id:'IN',label:'India',currency:'INR',locale:'en-IN'},
  {id:'US',label:'United States',currency:'USD',locale:'en-US'},
  {id:'GB',label:'United Kingdom',currency:'GBP',locale:'en-GB'},
];
export const plans=[
  {id:'explorer',name:'Explorer trial',caption:'Try 13 tools for two days.',features:['3 tool launches per day shared across 13 trial tools','BIM, STL-3D and FEM: coming soon for trial users','AI features: coming soon; regular tool features remain available','Two 24-hour trial days from your first launch','Sign in to track your trial across devices'],prices:{INR:0,USD:0,GBP:0}},
  {id:'studio',name:'Studio',caption:'For individual practice.',features:['All 16 tools without trial launch limits','Your online account','Subscription and billing management'],prices:{INR:99900,USD:1900,GBP:1500}},
  {id:'team',name:'Team',caption:'For growing practices.',features:['All 16 tools without trial launch limits','Studio account and billing','Additional team features under development'],prices:{INR:299900,USD:4900,GBP:3900}},
];
export function selection(planId,regionId,interval){
  const plan=plans.find(item=>item.id===planId);
  const region=regions.find(item=>item.id===regionId);
  if(!plan||!region||!['monthly','annual'].includes(interval))return null;
  return {plan,region,interval,amount:plan.prices[region.currency]*(interval==='annual'?10:1),key:`${plan.id}_${interval}_${region.currency}`.toUpperCase()};
}
export function formatPrice(amount,regionId){
  const region=regions.find(item=>item.id===regionId)||regions[0];
  return new Intl.NumberFormat(region.locale,{style:'currency',currency:region.currency,maximumFractionDigits:0}).format(amount/100);
}
