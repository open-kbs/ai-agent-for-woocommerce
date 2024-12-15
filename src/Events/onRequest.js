import {getActions} from './actions.js';

export const handler = async (event) => {
    const actions = getActions({ _meta_actions: [] });

    for (let [regex, action] of actions) {
        const lastMessage = event.payload.messages[event.payload.messages.length - 1].content;        
        const match = lastMessage?.match(regex);        
        if (match) return await action(match, event);
    }

    return { type: 'CONTINUE' }
};