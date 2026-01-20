import { type Plugin, tool } from "@opencode-ai/plugin"

interface RalphTask {
  id: string
  content: string
  status: "pending" | "in_progress" | "completed" | "failed"
  sessionId?: string
  error?: string
}

interface ModelConfig {
  providerID: string
  modelID: string
}

interface RalphLoop {
  id: string
  originalPrompt: string
  tasks: RalphTask[]
  currentTaskIndex: number
  createdAt: number
  model?: ModelConfig
  running: boolean
}

// In-memory state
let activeLoop: RalphLoop | null = null
let lastKnownTodos: any[] = []

// Default model for all ralph operations
const DEFAULT_MODEL: ModelConfig = {
  providerID: "opencode",
  modelID: "minimax-m2.1-free",
}

// Parse model string "provider/model" into ModelConfig
const parseModelString = (modelStr: string): ModelConfig | null => {
  const parts = modelStr.split("/")
  if (parts.length >= 2) {
    return {
      providerID: parts[0],
      modelID: parts.slice(1).join("/"),
    }
  }
  return null
}

export const RalphWiggumPlugin: Plugin = async ({ client }) => {

  // Get the model from a session by fetching its messages
  const getSessionModel = async (sessionId: string): Promise<ModelConfig | undefined> => {
    try {
      const messagesResponse = await client.session.messages({
        path: { id: sessionId },
        query: { limit: 1 },
      })
      const messages = messagesResponse?.data
      if (messages && messages.length > 0) {
        const latestMessage = messages[0]
        if (latestMessage.info.role === "user" && latestMessage.info.model) {
          return {
            providerID: latestMessage.info.model.providerID,
            modelID: latestMessage.info.model.modelID,
          }
        }
        if (latestMessage.info.role === "assistant") {
          return {
            providerID: latestMessage.info.providerID,
            modelID: latestMessage.info.modelID,
          }
        }
      }
    } catch (e) {
      // Fall back to default
    }
    return undefined
  }

  // Execute a single task in a fresh session
  const executeTask = async (task: RalphTask, loop: RalphLoop): Promise<void> => {
    try {
      // Create a fresh session for this task
      const sessionResponse = await client.session.create({ body: {} })
      const session = sessionResponse?.data
      if (!session) {
        task.status = "failed"
        task.error = "Failed to create session"
        return
      }
      task.sessionId = session.id
      task.status = "in_progress"

      const workerPrompt = `You have ONE task to complete:

## Task
${task.content}

## Context
This is part of a larger workflow: "${loop.originalPrompt}"

## Instructions
- Complete this task thoroughly
- Do NOT work on any other tasks
- When finished, simply say "TASK COMPLETE" with a brief summary

Begin now.`

      // session.prompt() waits for the full response - no polling needed!
      await client.session.prompt({
        path: { id: session.id },
        body: {
          ...(loop.model ? { model: loop.model } : {}),
          parts: [{ type: "text", text: workerPrompt }],
        },
      })

      task.status = "completed"
    } catch (e) {
      task.status = "failed"
      task.error = e instanceof Error ? e.message : String(e)
    }
  }

  // Use an AI session to break down a prompt into tasks
  const breakDownPrompt = async (prompt: string, model?: ModelConfig): Promise<string[]> => {
    // Create a planning session
    const sessionResponse = await client.session.create({ body: {} })
    const session = sessionResponse?.data
    if (!session) {
      throw new Error("Failed to create planning session")
    }

    const planningPrompt = `You are a task planner. Break down this request into a numbered list of sequential, atomic tasks.

## Request
${prompt}

## Rules
1. Each task should be completable in a single focused session
2. Tasks should be sequential (each builds on the previous)
3. Be specific and actionable
4. Output ONLY a numbered list, nothing else
5. Keep tasks small enough to avoid context overflow
6. Usually 3-8 tasks is ideal

## Example Output
1. Create the database schema for user authentication
2. Implement the login endpoint with JWT tokens
3. Add input validation and error handling
4. Write unit tests for the auth module

Now break down the request:`

    const response = await client.session.prompt({
      path: { id: session.id },
      body: {
        ...(model ? { model } : {}),
        parts: [{ type: "text", text: planningPrompt }],
      },
    })

    // Extract the numbered list from the response
    const messages = await client.session.messages({
      path: { id: session.id },
      query: { limit: 10 },
    })
    
    const assistantMessage = messages?.data?.find(m => m.info.role === "assistant")
    if (!assistantMessage) {
      throw new Error("No response from planning session")
    }

    // Find text parts in the response
    const textParts = assistantMessage.parts.filter(p => p.type === "text")
    const responseText = textParts.map(p => (p as any).text || "").join("\n")

    // Parse numbered list (e.g., "1. Task one\n2. Task two")
    const lines = responseText.split("\n")
    const tasks: string[] = []
    
    for (const line of lines) {
      const match = line.match(/^\d+[\.\)]\s*(.+)/)
      if (match && match[1].trim()) {
        tasks.push(match[1].trim())
      }
    }

    return tasks
  }

  return {
    event: async ({ event }) => {
      if (event.type === "todo.updated" && event.properties) {
        lastKnownTodos = event.properties.todos || []
      }
    },

    tool: {
      // === FIRE-AND-FORGET: Single command that does everything ===
      ralph_auto: tool({
        description: "Fully automatic Ralph loop - provide a prompt, and this will break it down into tasks and execute them all in fresh sessions. No further interaction needed. Perfect for 'opencode run' or fire-and-forget usage.",
        args: {
          prompt: tool.schema.string().describe("The complex task to break down and execute"),
          model: tool.schema.string().optional().describe("Model to use (format: provider/model). Defaults to current session's model."),
        },
        async execute({ prompt, model }, ctx) {
          let modelConfig: ModelConfig
          
          if (model) {
            modelConfig = parseModelString(model) || DEFAULT_MODEL
          } else {
            modelConfig = await getSessionModel(ctx.sessionID) || DEFAULT_MODEL
          }

          const modelInfo = `${modelConfig.providerID}/${modelConfig.modelID}`

          const results: string[] = []
          results.push(`Ralph Auto-Loop Starting`)
          results.push(`=========================`)
          results.push(`Prompt: "${prompt}"`)
          results.push(`Model: ${modelInfo}`)
          results.push(``)

          // Step 1: Break down the prompt into tasks
          results.push(`Step 1: Planning tasks...`)
          let taskDescriptions: string[]
          try {
            taskDescriptions = await breakDownPrompt(prompt, modelConfig)
          } catch (e) {
            return `Failed to break down prompt: ${e instanceof Error ? e.message : String(e)}`
          }

          if (taskDescriptions.length === 0) {
            return `Failed to extract tasks from planning session. Please try again or use ralph_start for manual task definition.`
          }

          results.push(`Identified ${taskDescriptions.length} tasks:`)
          taskDescriptions.forEach((t, i) => results.push(`  ${i + 1}. ${t}`))
          results.push(``)

          // Step 2: Create the loop
          const loop: RalphLoop = {
            id: `ralph_auto_${Date.now()}`,
            originalPrompt: prompt,
            tasks: taskDescriptions.map((content, i) => ({
              id: `task_${i + 1}`,
              content,
              status: "pending" as const,
            })),
            currentTaskIndex: -1,
            createdAt: Date.now(),
            model: modelConfig,
            running: true,
          }

          activeLoop = loop

          // Step 3: Execute all tasks
          results.push(`Step 2: Executing tasks...`)
          results.push(``)

          for (let i = 0; i < loop.tasks.length; i++) {
            const task = loop.tasks[i]
            loop.currentTaskIndex = i

            results.push(`--- Task ${i + 1}/${loop.tasks.length} ---`)
            results.push(`Task: ${task.content}`)

            await executeTask(task, loop)

            if (task.status === "completed") {
              results.push(`Session: ${task.sessionId}`)
              results.push(`Status: COMPLETED`)
            } else {
              results.push(`Session: ${task.sessionId || "N/A"}`)
              results.push(`Status: FAILED - ${task.error || "Unknown error"}`)
            }
            results.push(``)
          }

          loop.running = false

          // Summary
          const completedCount = loop.tasks.filter(t => t.status === "completed").length
          const failedCount = loop.tasks.filter(t => t.status === "failed").length
          
          results.push(`=========================`)
          results.push(`Ralph Auto-Loop Complete`)
          results.push(`=========================`)
          results.push(`Completed: ${completedCount}/${loop.tasks.length}`)
          if (failedCount > 0) results.push(`Failed: ${failedCount}`)
          results.push(``)
          results.push(`Sessions created:`)
          loop.tasks.forEach((t, i) => {
            results.push(`  ${i + 1}. [${t.status}] ${t.sessionId || "N/A"}`)
          })

          activeLoop = null
          return results.join("\n")
        },
      }),

      // === ORCHESTRATED: Traditional multi-step approach ===
      ralph_start: tool({
        description: "Start a Ralph Wiggum loop - you (the orchestrator) will create a todo list, then spawn fresh sessions for each task sequentially. By default, worker sessions use the same model as the orchestrator.",
        args: {
          prompt: tool.schema.string().describe("The task prompt to break down and execute"),
          model: tool.schema.string().optional().describe("Model to use for worker sessions (format: provider/model, e.g. 'anthropic/claude-opus-4-5-20250929'). If not specified, uses the orchestrator's current model."),
        },
        async execute({ prompt, model }, ctx) {
          lastKnownTodos = []
          
          let modelConfig: ModelConfig
          
          if (model) {
            modelConfig = parseModelString(model) || DEFAULT_MODEL
          } else {
            modelConfig = await getSessionModel(ctx.sessionID) || DEFAULT_MODEL
          }
          
          activeLoop = {
            id: `ralph_${Date.now()}`,
            originalPrompt: prompt,
            tasks: [],
            currentTaskIndex: -1,
            createdAt: Date.now(),
            model: modelConfig,
            running: false,
          }

          const modelInfo = `${modelConfig.providerID}/${modelConfig.modelID}`

          return `Ralph Wiggum loop initialized.

## Your Task
"${prompt}"

## Model
Worker sessions will use: ${modelInfo}
${model ? "(explicitly specified)" : "(default: opencode/minimax-m2.1-free)"}

## Next Steps (you are the orchestrator)
1. Use TodoWrite to break this task into individual, sequential steps
2. Then call \`ralph_run\` to begin - this will spawn a fresh session for each task, one at a time
3. You'll stay in control and monitor progress

Create the todo list now.`
        },
      }),

      ralph_add_tasks: tool({
        description: "Add tasks directly to the Ralph loop. Use this after ralph_start to add tasks that will be executed sequentially.",
        args: {
          tasks: tool.schema.array(tool.schema.object({
            id: tool.schema.string().describe("Unique task ID"),
            content: tool.schema.string().describe("Task description"),
          })).describe("Array of tasks to add"),
        },
        async execute({ tasks }, ctx) {
          if (!activeLoop) {
            return "Error: No active Ralph loop. Call ralph_start first."
          }

          for (const task of tasks) {
            activeLoop.tasks.push({
              id: task.id,
              content: task.content,
              status: "pending",
            })
          }

          return `Added ${tasks.length} tasks to Ralph loop. Total tasks: ${activeLoop.tasks.length}

Tasks:
${activeLoop.tasks.map((t, i) => `  ${i + 1}. [${t.status}] ${t.content}`).join("\n")}

Call \`ralph_run\` to start executing these tasks sequentially.`
        },
      }),

      ralph_run: tool({
        description: "Run the Ralph loop - spawns a session for each pending task, waits for completion, then moves to the next. Make sure you've added tasks with ralph_add_tasks or TodoWrite first.",
        args: {},
        async execute(args, ctx) {
          if (!activeLoop) {
            return "Error: No active Ralph loop. Call ralph_start first."
          }

          if (activeLoop.running) {
            return "Error: Ralph loop is already running. Use ralph_status to check progress."
          }

          // Try to use tasks already added via ralph_add_tasks
          // If none, try to use the lastKnownTodos from events
          if (activeLoop.tasks.length === 0 && lastKnownTodos.length > 0) {
            activeLoop.tasks = lastKnownTodos
              .filter((t: any) => t.status === "pending" || t.status === "in_progress")
              .map((t: any) => ({
                id: t.id,
                content: t.content,
                status: "pending" as const,
              }))
          }

          if (activeLoop.tasks.length === 0) {
            return `Error: No tasks found in Ralph loop. 

You need to add tasks first using one of these methods:
1. Use \`ralph_add_tasks\` to add tasks directly to the loop
2. Use \`TodoWrite\` tool to create a todo list

Example with ralph_add_tasks:
Call ralph_add_tasks with tasks: [{ id: "1", content: "First task" }, { id: "2", content: "Second task" }]`
          }

          const pendingTasks = activeLoop.tasks.filter(t => t.status === "pending")
          if (pendingTasks.length === 0) {
            return "No pending tasks to run. All tasks may already be completed."
          }

          const results: string[] = []
          results.push(`Starting Ralph loop with ${pendingTasks.length} pending tasks...\n`)

          const loop = activeLoop
          loop.running = true

          for (let i = 0; i < loop.tasks.length; i++) {
            const task = loop.tasks[i]
            if (task.status !== "pending") continue
            
            loop.currentTaskIndex = i

            results.push(`\n--- Task ${i + 1}/${loop.tasks.length} ---`)
            results.push(`Task: ${task.content}`)

            await executeTask(task, loop)

            if (task.status === "completed") {
              results.push(`Session: ${task.sessionId}`)
              results.push(`Status: COMPLETED`)
            } else {
              results.push(`Session: ${task.sessionId || "N/A"}`)
              results.push(`Status: FAILED - ${task.error || "Unknown error"}`)
            }
          }

          loop.running = false

          const completedCount = loop.tasks.filter(t => t.status === "completed").length
          const failedCount = loop.tasks.filter(t => t.status === "failed").length
          
          results.push(`\n--- Ralph Loop Complete ---`)
          results.push(`Completed: ${completedCount}/${loop.tasks.length}`)
          if (failedCount > 0) results.push(`Failed: ${failedCount}`)
          results.push(`\n<ralph_done>Processed ${loop.tasks.length} tasks</ralph_done>`)

          activeLoop = null
          return results.join("\n")
        },
      }),

      ralph_status: tool({
        description: "Check the status of the current Ralph loop",
        args: {},
        async execute(args, ctx) {
          if (!activeLoop) {
            return "No active Ralph loop."
          }

          const pending = activeLoop.tasks.filter(t => t.status === "pending").length
          const inProgress = activeLoop.tasks.filter(t => t.status === "in_progress").length
          const completed = activeLoop.tasks.filter(t => t.status === "completed").length
          const failed = activeLoop.tasks.filter(t => t.status === "failed").length
          
          const modelInfo = activeLoop.model 
            ? `${activeLoop.model.providerID}/${activeLoop.model.modelID}`
            : `${DEFAULT_MODEL.providerID}/${DEFAULT_MODEL.modelID}`

          return `Ralph Loop: ${activeLoop.id}
Prompt: "${activeLoop.originalPrompt}"
Model: ${modelInfo}
Running: ${activeLoop.running ? "YES" : "NO"}
Progress: ${completed}/${activeLoop.tasks.length} (${pending} pending, ${inProgress} in progress, ${failed} failed)

Tasks:
${activeLoop.tasks.length > 0 ? activeLoop.tasks.map((t, i) => `  ${i + 1}. [${t.status}] ${t.content}${t.sessionId ? ` (session: ${t.sessionId})` : ""}${t.error ? ` - Error: ${t.error}` : ""}`).join("\n") : "  (no tasks added yet)"}`
        },
      }),

      ralph_help: tool({
        description: "Show help for the Ralph Wiggum technique",
        args: {},
        async execute(args, ctx) {
          return `Ralph Wiggum - Multi-Session Task Runner
Based on: https://ghuntley.com/ralph/

## Two Modes

### 1. Automatic (Fire-and-Forget)
Use \`ralph_auto\` for fully automatic execution:
- Breaks down your prompt into tasks automatically
- Executes all tasks in fresh sessions
- No further interaction needed
- Perfect for \`opencode run\` or background tasks

Example:
  ralph_auto "Implement user authentication with JWT"

### 2. Orchestrated (Manual Control)
Use the traditional multi-step approach:
1. ralph_start "prompt" - Initialize the loop
2. ralph_add_tasks [...] - Add tasks manually
3. ralph_run - Execute all tasks

## Why Fresh Sessions?
- Prevents context pollution between tasks
- Each task gets full context window
- Failures are isolated
- Cleaner git history per task

## Model Selection
Default model: opencode/minimax-m2.1-free
Override with: ralph_auto "task" --model "anthropic/claude-opus-4-5-20250929"

## CLI Usage (Headless)
Run without TUI:
  opencode run "Use ralph_auto to implement feature X"

Or with a running server:
  opencode serve &
  opencode run --attach http://localhost:4096 "Use ralph_auto to..."

## Tools
- ralph_auto "prompt" - Automatic breakdown and execution
- ralph_start "prompt" - Initialize manual loop
- ralph_add_tasks [{id, content}, ...] - Add tasks to manual loop
- ralph_run - Execute manual loop
- ralph_status - Check progress
- ralph_help - This help`
        },
      }),
    },
  }
}
