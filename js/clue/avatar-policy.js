export const AVATAR_MODES={robots:'No Human Avatars',mixed:'Robot and Human Avatars',humans:'Only Human Avatars'};
export const avatarMode=value=>Object.hasOwn(AVATAR_MODES,value)?value:'mixed';
export function humanAvatar(mode,id,humanIds=[]){return mode==='humans'||id!=='butler'&&mode!=='robots'&&humanIds.includes(id);}
