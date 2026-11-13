# DayForge — Own Your Time. Build Your Future.

DayForge is a local-first personal productivity web application combining daily planning rituals, real-time stopwatch & Pomodoro tracking, side-by-side Markdown notes, two-way Google Calendar / `.ics` integration, recurring tasks & habits, and data-backed productivity analytics.

---

## Completed Phases

### Phase 1: Core Productivity Engine
- **Daily Plan & Tasks**: Create, edit, reorder, filter, and complete tasks with markdown descriptions, subtasks, priority (`Low`, `Medium`, `High`), categories, tags, and planned vs. actual time.
- **Live Timer & Time Logs**: Stopwatch and Pomodoro timer with single-active-timer protection, manual time entry, and Zen Focus mode.
- **Side-by-Side Notes**: Resizable Markdown notes pane linked to tasks or daily dates, including a `"Create task from line"` action.
- **Analytics**: Real-time calculation of Daily Productivity Score, streaks, 90-day consistency heatmap, Planned vs. Actual bar charts, and category/status donuts.

### Phase 2: Calendar, Reminders & Habits
- **Calendar Page**: Day, Week, and Month views with 15-minute drag-and-drop rescheduling, bottom-edge duration resizing, overlap detection, and read-only external events.
- **Recurring Tasks**: On-the-fly occurrence expansion (`daily`, `weekdays`, `weekly`, `every_n_days`, `every_n_weeks`) with per-occurrence overrides (`"This occurrence"` vs `"This and all future"`).
- **Google Calendar & `.ics` Portability**: Real browser OAuth 2.0 token flow for two-way Google Calendar sync plus RFC 5545 `.ics` import/export.
- **Habits & Reminders**: Daily/weekly habits with streak rules, browser Notification API + in-app toast reminders, and installable PWA manifest + service worker.

### Phase 3: Premium Power Features (`schemaVersion: 3`)
1. **Eisenhower Matrix Page**:
   - 4 quadrants (`Do First`, `Schedule`, `Quick Tasks`, `Eliminate`) with scope filter (`Today`, `This Week`, `All Open`) and category filter.
   - Drag-and-drop between quadrants + accessible `"Move to..."` menu on every card. For recurring tasks, `important`/`urgent` flag updates apply to the whole series.
   - `"Time by Quadrant"` donut chart in Analytics calculated from real `TimeLog` entries.
2. **All Tasks Workspace Page**:
   - **List / Kanban Toggle** (`To Do`, `In Progress`, `Completed`, `Skipped`). Moving to `Completed` sets `completedAt`; moving back clears it.
   - Group by (`none`, `date`, `category`, `priority`, `status`), Sort by (`date`, `priority`, `estimate`, `created`), and filter by category, tags, priority, status, date range, has note, recurring, or synced to Google, plus search with `<mark>` highlighted matches.
   - **Saved Views**: Built-in views (`Today`, `Overdue`, `High Priority`, `This Week`, `By Category`, `Completed`) plus custom views with `"Save current view"`, rename/delete, and `"Pin to sidebar"`.
   - **Bulk Actions & Tag Manager**: Multi-select tasks to complete, reschedule, recategorize, tag, reprioritize, or delete (with confirmation + one-click **Undo** banner). Full Tag Manager modal to rename, merge, or delete tags across tasks and notes.
3. **Daily Wrap-Up Ritual (Sunsama-style 4-Step Wizard)**:
   - **Step 1 (Summary)**: Tasks completed, planned vs. actual hours, productivity score, habits done, and `"Most important thing I did today"`.
   - **Step 2 (Reflection)**: What went well, what didn't finish, distractions, tomorrow's improvement, Mood & Energy (1–5) check-in, and option to append to the Daily Note.
   - **Step 3 (Unfinished Tasks)**: Per-task decision (`Carry to tomorrow`, `Pick another date`, `Mark skipped`, `Leave`), applied only when clicking **Finish & Close Day**.
   - **Step 4 (Plan Tomorrow)**: Top 3 priorities for tomorrow, tomorrow's calendar load vs. capacity indicator, and optional Day Template application.
4. **Weekly Review**:
   - Generated from real stored data for any week (`This week so far`, `Last full week`, or custom Monday start), matching Analytics numbers for the same week.
   - Shows previous-week comparison deltas (`↑`/`↓`), best/weakest day, top categories by time and completion, habit consistency, average mood/energy, and goal progress.
   - **Plain-Language Insights Rule**: Generates 2–3 plain-language insights **only when at least 3 active days of data exist** in the chosen week; otherwise displays a clear notice that there isn't enough data yet.
5. **Smart Planning (Rule-Based, Deterministic)**:
   - **Load vs. Capacity Badge**: Displays planned minutes vs. available working minutes (working hours minus external calendar events) with `OK`, `Nearly Full (85%+)`, and `Overbooked (>100%)` states on Today and Calendar headers.
   - **Conflict Warnings & Free-Slot Finder**: Highlights overlapping tasks/events with a 1-click `"Fix: Move to HH:mm–HH:mm"` button, plus up to 3 nearest free slots inside the Task Detail modal.
   - **Smart Replan Rules (`"Replan my day"`)**:
     - Proposes a conflict-free schedule for today's remaining unfinished tasks starting from `now` (rounded up to the next 15-minute mark) inside working hours.
     - **Never touches** external calendar events, completed/skipped tasks, or tasks marked `"Fixed time"` (`fixedTime: true`).
     - Orders movable tasks by: (1) `important + urgent` (Eisenhower quadrant rank), (2) `Priority` (`High` > `Medium` > `Low`), and (3) `estimatedMinutes`.
     - Uses first-fit into free gaps with a configurable buffer (default `5 min`). Tasks that cannot fit into today's remaining working hours are listed under `"Can't fit today: move to tomorrow?"` for explicit approval, with full **Undo** support.
6. **Goals, Templates & Focus Targets**:
   - Goals with `focus hours`, `tasks completed`, or `manual %` progress tracking, milestones, linked tasks, and a 4-week contribution bar chart.
   - Starter Day Templates (*Study Day*, *Gym Day*, *Deep-Work Day*), `"Save today as template"`, and conflict preview before applying to any date.
7. **Mood, Energy, Achievements & Reports**:
   - Daily Mood & Energy (1–5) check-in and Analytics correlation chart (observational note shown **only when `>= 10` logged days exist**).
   - Achievements page with progress bars and unlock dates (**seeded demo data never counts toward achievements**).
   - RFC 4180 CSV Export with UTF-8 BOM (`\uFEFF`) and print-friendly A4 Reports (`Daily` / `Weekly` / `Monthly`) with `"Print / Save as PDF"`.

---

## Keyboard Shortcuts

Shortcuts are automatically disabled while typing in any input, textarea, select, or editor, and can be toggled on/off in **Settings**.

| Shortcut | Action |
| :--- | :--- |
| `Ctrl / Cmd + K` | Open Command Palette & Global Search |
| `/` | Open Global Search |
| `N` | Create New Task (opens Task Modal) |
| `Q` | Focus Quick-Add Task Input |
| `F` | Toggle Focus / Zen Mode |
| `P` | Pause / Resume Active Timer |
| `W` | Open Daily Wrap-Up Ritual |
| `[` | Toggle Left Sidebar |
| `]` | Toggle Right Notes Pane |
| `G` then `T` | Jump to Today Plan |
| `G` then `C` | Jump to Calendar |
| `G` then `A` | Jump to Analytics |
| `G` then `H` | Jump to Habits |
| `?` | Open Keyboard Shortcuts Cheat Sheet |
