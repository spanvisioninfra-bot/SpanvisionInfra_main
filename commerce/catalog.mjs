// Existing Studio/Team prices retained for the approved trial-to-paid policy.
export const regions=[
  {id:'IN',label:'India',currency:'INR',locale:'en-IN'},
  {id:'US',label:'United States',currency:'USD',locale:'en-US'},
  {id:'GB',label:'United Kingdom',currency:'GBP',locale:'en-GB'},
];
export const plans=[
  {id:'explorer',name:'Explorer trial',caption:'Try the complete toolkit for two days.',features:['3 tool launches per day across all 16 tools','Two 24-hour trial days from your first launch','Sign in to track your trial across devices'],prices:{INR:0,USD:0,GBP:0}},
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
