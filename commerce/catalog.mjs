// Draft prices requested for the home-page preview. Approve before enabling checkout.
export const regions=[
  {id:'IN',label:'India',currency:'INR',locale:'en-IN'},
  {id:'US',label:'United States',currency:'USD',locale:'en-US'},
  {id:'GB',label:'United Kingdom',currency:'GBP',locale:'en-GB'},
];
export const plans=[
  {id:'explorer',name:'Explorer',caption:'Start with your next idea.',features:['Open all 16 browser tools','Local profiles and browser drafts','Keep your exported project files'],prices:{INR:0,USD:0,GBP:0}},
  {id:'studio',name:'Studio',caption:'A proposed plan for individual practice.',features:['Explorer workspace access','Your online account','Subscription and billing management'],prices:{INR:99900,USD:1900,GBP:1500}},
  {id:'team',name:'Team',caption:'A proposed plan for growing practices.',features:['Studio account and billing','Team package under development','Final team features to be confirmed'],prices:{INR:299900,USD:4900,GBP:3900}},
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
