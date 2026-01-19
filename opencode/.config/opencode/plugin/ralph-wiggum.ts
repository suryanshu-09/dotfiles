import { type Plugin, tool } from "@opencode-ai/plugin"

export const RalphWiggumPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      ralph_start: tool({
        description: "Start a Ralph Wiggum loop - an iterative self-referential development technique. Signal completion with <ralph_done>REASON</ralph_done>",
        args: {
          prompt: tool.schema.string().describe("The task prompt to loop on"),
          max_iterations: tool.schema.number().default(10).describe("Maximum iterations before auto-stop"),
        },
        async execute({ prompt, max_iterations }, ctx) {
          return "Ralph Wiggum loop activated! Max iterations: " + max_iterations + ". Signal completion with <ralph_done>REASON</ralph_done>. Your task: " + prompt
        },
      }),
      ralph_help: tool({
        description: "Show help for the Ralph Wiggum technique",
        args: {},
        async execute(args, ctx) {
          return "Ralph Wiggum technique: while true; do cat PROMPT.md | ai-agent; done. See https://ghuntley.com/ralph/"
        },
      }),
    },
  }
}
