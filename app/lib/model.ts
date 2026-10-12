export type Domain = "work" | "learning" | "personal";
export type SpaceId =
  | "ministry"
  | "stardust"
  | "studio"
  | "studies"
  | "reading"
  | "courses"
  | "health"
  | "life";
export type Task = {
  id: string;
  title: string;
  spaceId: SpaceId;
  date: string;
  priority: boolean;
  done: boolean;
  projectId?: string;
};
export type Proposal = {
  id: string;
  title: string;
  spaceId: SpaceId;
  date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
};
export type Note = { id: string; title: string; spaceId: SpaceId };
export type Project = {
  id: string;
  title: string;
  spaceId: SpaceId;
  deadline: string;
  notes: string;
};
export type CalendarEvent = {
  id: string;
  title: string;
  spaceId: SpaceId;
  date: string;
  time: string;
  duration: string;
};
export type Habit = {
  id: string;
  title: string;
  spaceId: SpaceId;
  days: string[];
};
export type Goal = {
  id: string;
  title: string;
  spaceId: SpaceId;
  deadline: string;
  current: number;
  target: number;
};
export type CustomSpace = { id: string; title: string };
export type State = {
  activity?: { id: string; at: string; label: string }[];
  habits?: Habit[];
  goals?: Goal[];
  customSpaces?: CustomSpace[];
  tasks: Task[];
  notes: Note[];
  proposals: Proposal[];
  projects?: Project[];
  events?: CalendarEvent[];
  preferences?: { weekStarts: "saturday" | "monday" };
};
export const emptyState: State = {
  tasks: [],
  notes: [],
  proposals: [],
  projects: [],
  events: [],
  preferences: { weekStarts: "saturday" },
};
export function todayDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Damascus",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export const demoDate = "2026-10-11";
export const domains: { id: Domain; name: string; subtitle: string }[] = [
  { id: "work", name: "العمل", subtitle: "مشاريعك وأثرك المهني" },
  { id: "learning", name: "التعلّم", subtitle: "معرفة تنمو معك" },
  { id: "personal", name: "الحياة الشخصية", subtitle: "مساحة لنفسك وما تحب" },
];
export const spaces: {
  id: SpaceId;
  name: string;
  domain: Domain;
  description: string;
}[] = [
  {
    id: "ministry",
    name: "العمل الوزاري",
    domain: "work",
    description: "تنظيم العمل والمتابعة",
  },
  {
    id: "stardust",
    name: "ستاردست",
    domain: "work",
    description: "من الفكرة إلى مشروع",
  },
  {
    id: "studio",
    name: "استوديو السلام",
    domain: "work",
    description: "التصميم والعمل الإبداعي",
  },
  {
    id: "studies",
    name: "الدراسة",
    domain: "learning",
    description: "خطوات واضحة نحو المعرفة",
  },
  {
    id: "reading",
    name: "الكتب والقراءة",
    domain: "learning",
    description: "كتاب واحد، عالم جديد",
  },
  {
    id: "courses",
    name: "الدورات الإلكترونية",
    domain: "learning",
    description: "مهارات تطوّرها على مهل",
  },
  {
    id: "health",
    name: "الصحة والعادات",
    domain: "personal",
    description: "روتين بسيط ليوم متوازن",
  },
  {
    id: "life",
    name: "الحياة الشخصية",
    domain: "personal",
    description: "وقت لما يهمك خارج العمل",
  },
];
export const projects = spaces.map((s) => ({
  id: `project-${s.id}`,
  spaceId: s.id,
  title: {
    ministry: "خطة الأسبوع",
    stardust: "تطوير فكرة إبداعية",
    studio: "هوية بصرية تجريبية",
    studies: "خطة المراجعة",
    reading: "رحلة القراءة",
    courses: "أساسيات التصميم",
    health: "روتين متوازن",
    life: "ترتيب نهاية الأسبوع",
  }[s.id],
}));
export const events = [
  {
    id: "e1",
    spaceId: "ministry" as SpaceId,
    title: "جلسة تنسيق تجريبية",
    date: demoDate,
    time: "10:00",
    duration: "٤٥ دقيقة",
  },
  {
    id: "e2",
    spaceId: "studio" as SpaceId,
    title: "جلسة أفكار إبداعية",
    date: demoDate,
    time: "16:00",
    duration: "ساعة",
  },
];
export const initialState: State = {
  tasks: [
    {
      id: "t1",
      title: "مراجعة خطة العمل الأسبوعية",
      spaceId: "ministry",
      date: demoDate,
      priority: true,
      done: false,
    },
    {
      id: "t2",
      title: "تجهيز لوحة الإلهام للمشروع الجديد",
      spaceId: "studio",
      date: demoDate,
      priority: true,
      done: false,
    },
    {
      id: "t3",
      title: "قراءة ٢٠ صفحة من العادات الذرية",
      spaceId: "reading",
      date: demoDate,
      priority: true,
      done: true,
    },
    {
      id: "t4",
      title: "المشي لمدة ٣٠ دقيقة",
      spaceId: "health",
      date: demoDate,
      priority: false,
      done: false,
    },
    {
      id: "t5",
      title: "ترتيب ملاحظات الدرس السابق",
      spaceId: "studies",
      date: "2026-10-10",
      priority: false,
      done: false,
    },
  ],
  notes: [
    {
      id: "n1",
      title: "فكرة: لوحة ألوان هادئة للمشروع القادم",
      spaceId: "studio",
    },
    { id: "n2", title: "خصّص وقتًا للقراءة بعد الاستراحة", spaceId: "reading" },
  ],
  proposals: [
    {
      id: "p1",
      title: "تخصيص ٢٥ دقيقة لمراجعة ملاحظات الدراسة",
      spaceId: "studies",
      date: demoDate,
      reason: "خطوة قصيرة لمعالجة المهمة المتأخرة، دون ازدحام يومك.",
      status: "pending",
    },
  ],
};
export type Action =
  | { type: "hydrate"; state: State }
  | { type: "habit"; habit: Habit }
  | { type: "toggleHabit"; id: string; date: string }
  | { type: "deleteHabit"; id: string }
  | { type: "goal"; goal: Goal }
  | { type: "deleteGoal"; id: string }
  | { type: "customSpace"; space: CustomSpace }
  | { type: "editTask"; task: Task }
  | { type: "deleteTask"; id: string }
  | { type: "editNote"; note: Note }
  | { type: "deleteNote"; id: string }
  | { type: "project"; project: Project }
  | { type: "deleteProject"; id: string }
  | { type: "event"; event: CalendarEvent }
  | { type: "deleteEvent"; id: string }
  | { type: "preferences"; preferences: NonNullable<State["preferences"]> }
  | { type: "toggle"; id: string }
  | { type: "reschedule"; id: string }
  | {
      type: "capture";
      id: string;
      title: string;
      spaceId: SpaceId;
      kind: "task" | "note";
      date?: string;
    }
  | { type: "convert"; id: string }
  | { type: "propose"; proposal: Proposal }
  | {
      type: "editProposal";
      id: string;
      title: string;
      spaceId: SpaceId;
      date: string;
    }
  | { type: "decide"; id: string; decision: "approved" | "rejected" };
export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "hydrate":
      return action.state;
    case "habit":
      return {
        ...state,
        habits: [
          ...(state.habits ?? []).filter((h) => h.id !== action.habit.id),
          action.habit,
        ],
      };
    case "toggleHabit":
      return {
        ...state,
        habits: (state.habits ?? []).map((h) =>
          h.id === action.id
            ? {
                ...h,
                days: h.days.includes(action.date)
                  ? h.days.filter((d) => d !== action.date)
                  : [...h.days, action.date],
              }
            : h,
        ),
      };
    case "deleteHabit":
      return {
        ...state,
        habits: (state.habits ?? []).filter((h) => h.id !== action.id),
      };
    case "goal":
      return {
        ...state,
        goals: [
          ...(state.goals ?? []).filter((g) => g.id !== action.goal.id),
          action.goal,
        ],
      };
    case "deleteGoal":
      return {
        ...state,
        goals: (state.goals ?? []).filter((g) => g.id !== action.id),
      };
    case "customSpace":
      return {
        ...state,
        customSpaces: [
          ...(state.customSpaces ?? []).filter((s) => s.id !== action.space.id),
          action.space,
        ],
      };
    case "editTask":
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.task.id ? action.task : t,
        ),
      };
    case "deleteTask":
      return { ...state, tasks: state.tasks.filter((t) => t.id !== action.id) };
    case "editNote":
      return {
        ...state,
        notes: state.notes.map((n) =>
          n.id === action.note.id ? action.note : n,
        ),
      };
    case "deleteNote":
      return { ...state, notes: state.notes.filter((n) => n.id !== action.id) };
    case "project":
      return {
        ...state,
        projects: [
          ...(state.projects ?? []).filter((p) => p.id !== action.project.id),
          action.project,
        ],
      };
    case "deleteProject":
      return {
        ...state,
        projects: (state.projects ?? []).filter((p) => p.id !== action.id),
        tasks: state.tasks.map((t) =>
          t.projectId === action.id ? { ...t, projectId: undefined } : t,
        ),
      };
    case "event":
      return {
        ...state,
        events: [
          ...(state.events ?? []).filter((e) => e.id !== action.event.id),
          action.event,
        ],
      };
    case "deleteEvent":
      return {
        ...state,
        events: (state.events ?? []).filter((e) => e.id !== action.id),
      };
    case "preferences":
      return { ...state, preferences: action.preferences };
    case "toggle":
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.id ? { ...t, done: !t.done } : t,
        ),
      };
    case "reschedule":
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.id ? { ...t, date: todayDate() } : t,
        ),
      };
    case "capture": {
      const title = action.title.trim();
      if (
        !title ||
        state.tasks.some((t) => t.id === action.id) ||
        state.notes.some((n) => n.id === action.id)
      )
        return state;
      return action.kind === "task"
        ? {
            ...state,
            tasks: [
              ...state.tasks,
              {
                id: action.id,
                title,
                spaceId: action.spaceId,
                date: action.date ?? todayDate(),
                priority: false,
                done: false,
              },
            ],
          }
        : {
            ...state,
            notes: [
              ...state.notes,
              { id: action.id, title, spaceId: action.spaceId },
            ],
          };
    }
    case "convert": {
      const note = state.notes.find((n) => n.id === action.id);
      if (!note) return state;
      return {
        ...state,
        notes: state.notes.filter((n) => n.id !== note.id),
        tasks: [
          ...state.tasks,
          { ...note, date: todayDate(), priority: false, done: false },
        ],
      };
    }
    case "propose":
      return state.proposals.some((p) => p.id === action.proposal.id)
        ? state
        : { ...state, proposals: [...state.proposals, action.proposal] };
    case "editProposal":
      return {
        ...state,
        proposals: state.proposals.map((p) =>
          p.id === action.id && p.status === "pending" && action.title.trim()
            ? {
                ...p,
                title: action.title.trim(),
                spaceId: action.spaceId,
                date: action.date,
              }
            : p,
        ),
      };
    case "decide": {
      const proposal = state.proposals.find(
        (p) => p.id === action.id && p.status === "pending",
      );
      if (!proposal) return state;
      return {
        ...state,
        proposals: state.proposals.map((p) =>
          p.id === action.id ? { ...p, status: action.decision } : p,
        ),
        tasks:
          action.decision === "approved"
            ? [
                ...state.tasks,
                {
                  id: `proposal-${proposal.id}`,
                  title: proposal.title,
                  spaceId: proposal.spaceId,
                  date: proposal.date,
                  priority: false,
                  done: false,
                },
              ]
            : state.tasks,
      };
    }
  }
}
export const spaceName = (id: SpaceId) =>
  spaces.find((s) => s.id === id)?.name ?? "مساحة مخصصة";
export const number = (n: number) => n.toLocaleString("ar");
