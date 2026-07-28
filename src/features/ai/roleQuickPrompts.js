const GENERAL_PROMPTS = ['How is this project doing overall?', 'What needs my attention right now?'];
const CATEGORY_PROMPTS = {
    turf: [
        'Which territory is hardest to work right now?',
        'What time of day gets the best contact rate?',
        'Who is our top canvasser right now?'
    ],
    fundraising: [
        'Are we raising more or less than last week?',
        'What is our average donation?',
        'How many donations came directly from a doorstep ask?'
    ],
    comms: ['How is our social media performing?'],
    compete: []
};
export function quickPromptsForCategories(categories) {
    const prompts = [...GENERAL_PROMPTS];
    const seen = new Set(prompts);
    for (const category of categories) {
        for (const prompt of CATEGORY_PROMPTS[category] ?? []) {
            if (!seen.has(prompt)) {
                prompts.push(prompt);
                seen.add(prompt);
            }
        }
    }
    return prompts;
}
