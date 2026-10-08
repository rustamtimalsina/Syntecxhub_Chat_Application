const Conversation = require('../models/Conversation');
const { toSlug } = require('./slug');

const DEFAULTS = [
  { name: 'General', description: 'Everyone starts here' },
  { name: 'Web Dev', description: 'React, Node, MongoDB and friends' },
  { name: 'Random', description: 'Anything goes' },
];

module.exports = async () => {
  for (const room of DEFAULTS) {
    const slug = toSlug(room.name);
    await Conversation.updateOne(
      { type: 'channel', slug },
      { $setOnInsert: { type: 'channel', name: room.name, slug, description: room.description } },
      { upsert: true }
    );
  }
  console.log('Default rooms ready');
};