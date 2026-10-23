// The other person in a direct message
export const otherMember = (convo, myId) =>
  convo?.members?.find((m) => String(m._id) !== String(myId));

export const isGroup = (convo) => convo?.type === 'group';
export const isDm = (convo) => convo?.type === 'dm';
export const isChannel = (convo) => convo?.type === 'channel';

export const convoTitle = (convo, myId) => {
  if (!convo) return '';
  if (convo.type === 'channel') return `#${convo.name}`;
  if (convo.type === 'group') return convo.name || 'Group Chat';
  const other = otherMember(convo, myId);
  return other?.name || 'Direct Message';
};
