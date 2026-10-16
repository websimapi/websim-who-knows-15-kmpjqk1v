// Wire format shared by a future haircut task and the host match. Integer
// lengths use tenths of a millimeter; only cuts (never growth) are merged.
export const HAIR_GROOMS={"blue":["blue-v3",2800],"violet":["violet-v3",3100],"white":["white-v3",1600],"green":["green-v3",2400],"red":["red-v3",2400],"yellow":["yellow-v3",2800],"copper":["copper-v3",2800],"teal":["teal-v3",2800],"butler":["butler-v3",1600]};
export function normalizeHairState(id,state){
  const profile=HAIR_GROOMS[id];
  if(!profile||state?.schema!==1||state.groom!==profile[0]||!Array.isArray(state.cuts)||state.cuts.length>profile[1])return null;
  const cuts=new Map();
  for(const row of state.cuts){
    if(!Array.isArray(row)||row.length!==2)return null;
    const [strand,length]=row;
    if(!Number.isInteger(strand)||strand<0||strand>=profile[1]||!Number.isInteger(length)||length<0||length>100000)return null;
    cuts.set(strand,Math.min(cuts.get(strand)??Infinity,length));
  }
  return {schema:1,groom:profile[0],cuts:[...cuts].sort((a,b)=>a[0]-b[0])};
}
export function mergeHairState(id,previous,incoming){
  const valid=normalizeHairState(id,incoming);if(!valid)return null;
  const old=normalizeHairState(id,previous),merged=new Map(old?.cuts||[]);
  for(const [strand,length] of valid.cuts)merged.set(strand,Math.min(merged.get(strand)??Infinity,length));
  return {...valid,cuts:[...merged].sort((a,b)=>a[0]-b[0])};
}
