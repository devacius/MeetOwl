import { Mistral } from "@mistralai/mistralai";
import prompts from "../LLM/prompt.js"
const mistral = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY,
});

const queryLLM=async()=> {
  const captions="What is the capital of India?"
  if(!captions)return ;
  const result = await mistral.chat.complete({
    model: "mistral-small-latest",
    messages: [
      {
        content: prompts.meetingAssistantPrompt(captions),
        role: "user",
      },
    ],
  });

  console.log(result.choices[0].message);
}

export default queryLLM;