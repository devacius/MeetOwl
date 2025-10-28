const prompts={
    meetingSummaryPrompt: (captions) => `Summarize the following meeting captions into key points:\n\n${captions}`,
    meetingAssistantPrompt: (captions) => `Based on the following meeting captions, answer the question:\n\nCaptions:\n${captions}`,
}
export default prompts;