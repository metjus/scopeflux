// An explicit name-quality heuristic. This is not registry premium-price data.
const WORDS = new Set(`
academy agent agency air art auto bank beauty bike bird bloom book bot build care
cars cash chat city clean cloud code coffee coin craft data design digital dream
earth energy event farm fast film finance fit flow food fresh game garden global
gold green growth health home host house hub idea jobs learn life light link live
local logic love market media mind mobile money music nature nest news ocean office
open orbit pay pet photo pixel planet play power prime real robot rocket safe school
search shop simple smart social solar space spark sport star stone store studio
sun talent team tech trade travel tree trust urban video voice wave web work world
agent audio crypto domain hotel legal map motor partner phone print rental science
security software support tools train training web3 wellness wine yoga
auto banka byty cas cesta data design dom domy domov dovolenka doprava drevo energia
eshop firma firmy foto fotky hra hry hudba internet jedlo kava kino kniha knihy krasa
kurz kurzy les leto mesto moda more motorky nabytok napad obchod okno okna peniaze
pes pivo pocasie poistka praca predaj reality remeslo rodina skola sluzby sport
stavba stroj stroje svet svetlo telefon tlac ucenie umenie vino voda zahrada zdravie
`.trim().split(/\s+/).filter(word=>/^[a-z]+$/.test(word)));

export type PremiumAssessment = {candidate:boolean;reason:string};

export function assessPremium(domain:string):PremiumAssessment {
 const name=domain.toLowerCase().split('.')[0];
 if(!/^[a-z]+$/.test(name))return {candidate:false,reason:'Contains digits, hyphens or non-ASCII characters; outside these name-quality rules.'};
 if(name.length>=2&&name.length<=4)return {candidate:true,reason:`Short name: ${name.length} letters, with no digits or hyphens.`};
 if(WORDS.has(name))return {candidate:true,reason:'Single word from the curated English / Slovak keyword list.'};
 if(name.length<=12){
  for(let i=3;i<=name.length-3;i++){
   const first=name.slice(0,i),second=name.slice(i);
   if(WORDS.has(first)&&WORDS.has(second))return {candidate:true,reason:`Two curated words: ${first} + ${second}; ${name.length} letters in total.`};
  }
 }
 return {candidate:false,reason:'Does not match the short-name or curated-word rules. This is not a valuation.'};
}

export function matchesPremium(assessment:PremiumAssessment,filter:string):boolean {
 return filter==='all'||(filter==='premium'?assessment.candidate:!assessment.candidate);
}
