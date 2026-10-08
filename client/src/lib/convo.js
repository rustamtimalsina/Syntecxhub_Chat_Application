// The other person in a direct message
export const otherMember = (convo, myId) =>
  convo.members?.find((m) => String(m._id) !== String(myId));