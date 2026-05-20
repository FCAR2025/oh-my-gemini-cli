---
name = "ultrawork"
description = "Parallel execution engine for high-throughput task completion"
---

<Purpose>
Ultrawork is a parallel execution engine and execution protocol for independent work. It emphasizes intent grounding, parallel context gathering, dependency-aware task graphs for non-trivial work, and concise evidence-backed execution summaries. It is a component, not a standalone persistence mode -- it provides parallelism and routing guidance, but not persistence, verification loops, or long-lived state management.
</Purpose>

<Use_When>
- Multiple independent tasks can run simultaneously
- User says "ulw", "ultrawork", or wants parallel execution
- You need to delegate work to multiple agents at once
- Task benefits from concurrent execution but the user will manage completion themselves
</Use_When>

<Do_Not_Use_When>
- Task requires guaranteed completion with verification -- use `ralph` instead (ralph includes ultrawork)
- Task requires a full autonomous pipeline -- use `autopilot` instead (autopilot includes ralph which includes ultrawork)
- There is only one sequential task with no parallelism opportunity -- delegate directly to an omg-executor agent
- User needs session persistence for resume -- use `ralph` which adds persistence on top of ultrawork
</Do_Not_Use_When>

<Why_This_Exists>
Sequential task execution wastes time when tasks are independent. Ultrawork enables firing multiple agents simultaneously and routing each to the right model lane, reducing total execution time while controlling token costs. It is designed as a composable component that ralph and autopilot layer on top of.
</Why_This_Exists>

<Execution_Policy>
- Fire all independent agent calls simultaneously -- never serialize independent work
- Always specify the model lane explicitly when dispatching
- See OmG agent registry in `agents/` + model lanes in `context/omg-core.md` before first delegation for agent selection guidance
- Use background execution for operations over ~30 seconds (installs, builds, tests)
- Run quick commands (git status, file reads, simple checks) in the foreground
- Resolve intent and uncertainty before implementation; explore first, ask only when still blocked
- For non-trivial tasks, produce a dependency-aware plan with parallel waves before execution
- Keep delegated-task reports concise: short summary, files touched, verification status, blockers
- Manual QA is required for implemented behavior, not just diagnostics
</Execution_Policy>

<Steps>
1. **Read agent reference**: See OmG agent registry in `agents/` + model lanes in `context/omg-core.md` for lane selection
2. **Ground intent first**: Confirm whether the request is implementation, investigation, evaluation, or research; do not code before that is clear
3. **Gather context in parallel**:
   - use Gemini CLI search tools (`read_many_files`, `glob`, `search_file_content`) directly for quick reads/searches
   - dispatch omg-executor sub-agents for broad context or docs lookup
4. **Classify tasks by independence**: Identify which tasks can run in parallel vs which have dependencies
5. **Create a task graph for non-trivial work**:
   - Parallel Execution Waves
   - Dependency Matrix
   - acceptance criteria and verification steps per task
6. **Route to correct lanes**:
   - Simple lookups/definitions: quick-lane (gemini-3.1-flash-lite-preview)
   - Standard implementation: execution-lane (gemini-3-flash-preview)
   - Complex analysis/refactoring: planning-lane (gemini-3.1-pro-preview)
7. **Fire independent tasks simultaneously**: Launch all parallel-safe tasks at once
8. **Run dependent tasks sequentially**: Wait for prerequisites before launching dependent work
9. **Background long operations**: Builds, installs, and test suites run in background
10. **Verify when all tasks complete** (lightweight):
   - Build/typecheck passes
   - Affected tests pass
   - Manual QA completed for implemented behavior
   - No new errors introduced
</Steps>

<Tool_Usage>
- Dispatch omg-executor sub-agent with quick-lane model (gemini-3.1-flash-lite-preview) for simple changes
- Dispatch omg-executor sub-agent with execution-lane model (gemini-3-flash-preview) for standard work
- Dispatch omg-executor sub-agent with planning-lane model (gemini-3.1-pro-preview) for complex work
- Use `run_shell_command` with background execution for package installs, builds, and test suites
- Use `run_shell_command` in foreground for quick status checks; use `read_file` and `glob` for file operations
</Tool_Usage>

<Examples>
<Good>
Three independent tasks dispatched simultaneously:
```
dispatch omg-executor sub-agent with quick-lane model: "Add missing type export for Config interface"
dispatch omg-executor sub-agent with execution-lane model: "Implement the /api/users endpoint with validation"
dispatch omg-executor sub-agent with execution-lane model: "Add integration tests for the auth middleware"
```
Why good: Independent tasks at appropriate lanes, all dispatched at once.
</Good>

<Good>
Correct use of background execution:
```
dispatch omg-executor sub-agent with execution-lane model (background): "npm install && npm run build"
dispatch omg-executor sub-agent with quick-lane model: "Update the README with new API endpoints"
```
Why good: Long build runs in background while short task runs in foreground.
</Good>

<Bad>
Sequential execution of independent work:
```
result1 = dispatch omg-executor "Add type export"  # wait...
result2 = dispatch omg-executor "Implement endpoint"     # wait...
result3 = dispatch omg-executor "Add tests"              # wait...
```
Why bad: These tasks are independent. Running them sequentially wastes time.
</Bad>

<Bad>
Wrong lane selection:
```
dispatch omg-executor sub-agent with planning-lane model: "Add a missing semicolon"
```
Why bad: planning-lane is expensive overkill for a trivial fix. Use quick-lane instead.
</Bad>
</Examples>

<Escalation_And_Stop_Conditions>
- When ultrawork is invoked directly (not via ralph), apply lightweight verification only -- build passes, tests pass, no new errors
- For full persistence and comprehensive architect verification, recommend switching to `ralph` mode
- If a task fails repeatedly across retries, report the issue rather than retrying indefinitely
- Escalate to the user when tasks have unclear dependencies or conflicting requirements
</Escalation_And_Stop_Conditions>

<Final_Checklist>
- [ ] All parallel tasks completed
- [ ] Build/typecheck passes
- [ ] Affected tests pass
- [ ] No new errors introduced
</Final_Checklist>

<Advanced>
## Relationship to Other Modes

```
ralph (persistence wrapper)
 \-- includes: ultrawork (this skill)
     \-- provides: parallel execution only

autopilot (autonomous execution)
 \-- includes: ralph
     \-- includes: ultrawork (this skill)
```

Ultrawork is the parallelism layer. Ralph adds persistence and verification. Autopilot adds the full lifecycle pipeline.
</Advanced>
