export type GuideLanguage = "en" | "ko";

export type GuideStepItem = {
  id: string;
  title: string;
  menuLabel: string;
  menuHref: string;
  what: string;
  values: string;
  why: string;
  done: string;
  caution: string;
};

export type GuideMenuReferenceItem = {
  id: string;
  menu: string;
  menuHref: string;
  what: string;
  values: string;
  why: string;
};

export type GuideFaqItem = {
  id: string;
  q: string;
  a: string;
};

export type GuideLabels = {
  title: string;
  tooltip: string;
  contentsLabel: string;
  quickStartLabel: string;
  quickStartText: string;
  orgSetupLabel: string;
  teamSetupLabel: string;
  userSetupLabel: string;
  menuReferenceLabel: string;
  faqLabel: string;
  showLabel: string;
  hideLabel: string;
  menuFieldLabel: string;
  whatFieldLabel: string;
  valuesFieldLabel: string;
  whyFieldLabel: string;
  doneFieldLabel: string;
  cautionFieldLabel: string;
};

export type ParsedGuide = {
  labels: GuideLabels;
  sections: {
    org: GuideStepItem[];
    team: GuideStepItem[];
    user: GuideStepItem[];
  };
  menuReference: GuideMenuReferenceItem[];
  faq: GuideFaqItem[];
};

type InternalSection =
  | "meta"
  | "organization"
  | "team"
  | "user"
  | "menu_reference"
  | "faq"
  | null;

const DEFAULT_LABELS: Record<GuideLanguage, GuideLabels> = {
  en: {
    title: "User Guide",
    tooltip: "Step-by-step onboarding guide for Organization, Team, and User setup.",
    contentsLabel: "Contents",
    quickStartLabel: "Quick Start",
    quickStartText:
      "Recommended order: Organization baseline -> Team policy/keys -> User security/connections -> Usage/Audit checks.",
    orgSetupLabel: "Organization Setup",
    teamSetupLabel: "Team Setup",
    userSetupLabel: "User Setup",
    menuReferenceLabel: "Menu Reference",
    faqLabel: "Ops / FAQ",
    showLabel: "Show",
    hideLabel: "Hide",
    menuFieldLabel: "Menu",
    whatFieldLabel: "What",
    valuesFieldLabel: "Values",
    whyFieldLabel: "Why",
    doneFieldLabel: "Done",
    cautionFieldLabel: "Caution",
  },
  ko: {
    title: "사용자 가이드",
    tooltip: "Organization, Team, User 설정을 단계별로 안내합니다.",
    contentsLabel: "목차",
    quickStartLabel: "빠른 시작",
    quickStartText:
      "권장 순서: Organization 기준선 설정 -> Team 정책/키 배포 -> User 보안/연결 설정 -> Usage/Audit 점검.",
    orgSetupLabel: "Organization 설정",
    teamSetupLabel: "Team 설정",
    userSetupLabel: "User 설정",
    menuReferenceLabel: "메뉴 상세 가이드",
    faqLabel: "운영 / FAQ",
    showLabel: "보기",
    hideLabel: "접기",
    menuFieldLabel: "메뉴",
    whatFieldLabel: "무엇",
    valuesFieldLabel: "입력값",
    whyFieldLabel: "왜",
    doneFieldLabel: "완료 기준",
    cautionFieldLabel: "실수 방지",
  },
};

const META_KEY_MAP: Record<string, keyof GuideLabels> = {
  title: "title",
  tooltip: "tooltip",
  contents_label: "contentsLabel",
  quick_start_label: "quickStartLabel",
  quick_start_text: "quickStartText",
  org_setup_label: "orgSetupLabel",
  team_setup_label: "teamSetupLabel",
  user_setup_label: "userSetupLabel",
  menu_reference_label: "menuReferenceLabel",
  faq_label: "faqLabel",
  show_label: "showLabel",
  hide_label: "hideLabel",
  menu_field_label: "menuFieldLabel",
  what_field_label: "whatFieldLabel",
  values_field_label: "valuesFieldLabel",
  why_field_label: "whyFieldLabel",
  done_field_label: "doneFieldLabel",
  caution_field_label: "cautionFieldLabel",
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u3131-\uD79D]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function parseKvLine(line: string): { key: string; value: string } | null {
  const match = line.match(/^\s*-\s*([a-z_]+)\s*:\s*(.+)\s*$/i);
  if (!match) {
    return null;
  }
  return { key: match[1].toLowerCase(), value: match[2].trim() };
}

function emptyGuide(lang: GuideLanguage): ParsedGuide {
  return {
    labels: { ...DEFAULT_LABELS[lang] },
    sections: {
      org: [],
      team: [],
      user: [],
    },
    menuReference: [],
    faq: [],
  };
}

export function parseGuideMarkdown(markdown: string): Record<GuideLanguage, ParsedGuide> {
  const guides: Record<GuideLanguage, ParsedGuide> = {
    en: emptyGuide("en"),
    ko: emptyGuide("ko"),
  };

  const lines = markdown.split(/\r?\n/);
  let lang: GuideLanguage | null = null;
  let section: InternalSection = null;
  let pendingStep: GuideStepItem | null = null;
  let pendingMenu: GuideMenuReferenceItem | null = null;
  let pendingFaq: GuideFaqItem | null = null;

  const flush = () => {
    if (!lang) {
      return;
    }
    if (pendingStep) {
      if (section === "organization") {
        guides[lang].sections.org.push(pendingStep);
      } else if (section === "team") {
        guides[lang].sections.team.push(pendingStep);
      } else if (section === "user") {
        guides[lang].sections.user.push(pendingStep);
      }
      pendingStep = null;
    }
    if (pendingMenu) {
      guides[lang].menuReference.push(pendingMenu);
      pendingMenu = null;
    }
    if (pendingFaq) {
      guides[lang].faq.push(pendingFaq);
      pendingFaq = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();

    const langMatch = line.match(/^###\s*\[(en|ko)\]\s*$/i);
    if (langMatch) {
      flush();
      lang = langMatch[1].toLowerCase() as GuideLanguage;
      section = null;
      continue;
    }

    if (!lang) {
      continue;
    }

    const sectionMatch = line.match(/^####\s+(.+)$/);
    if (sectionMatch) {
      flush();
      const value = sectionMatch[1].trim().toLowerCase();
      if (value === "meta") {
        section = "meta";
      } else if (value === "organization_setup") {
        section = "organization";
      } else if (value === "team_setup") {
        section = "team";
      } else if (value === "user_setup") {
        section = "user";
      } else if (value === "menu_reference") {
        section = "menu_reference";
      } else if (value === "faq") {
        section = "faq";
      } else {
        section = null;
      }
      continue;
    }

    if (section === "organization" || section === "team" || section === "user") {
      const stepMatch = line.match(/^#####\s+(.+)$/);
      if (stepMatch) {
        flush();
        const title = stepMatch[1].trim();
        pendingStep = {
          id: slugify(title),
          title,
          menuLabel: "",
          menuHref: "/dashboard/overview",
          what: "",
          values: "",
          why: "",
          done: "",
          caution: "",
        };
        continue;
      }
    }

    if (section === "menu_reference") {
      const menuMatch = line.match(/^#####\s+(.+)$/);
      if (menuMatch) {
        flush();
        const menu = menuMatch[1].trim();
        pendingMenu = {
          id: slugify(menu),
          menu,
          menuHref: "/dashboard/overview",
          what: "",
          values: "",
          why: "",
        };
        continue;
      }
    }

    if (section === "faq") {
      const faqMatch = line.match(/^#####\s+Q:\s*(.+)$/i);
      if (faqMatch) {
        flush();
        const q = faqMatch[1].trim();
        pendingFaq = { id: slugify(q), q, a: "" };
        continue;
      }
    }

    const kv = parseKvLine(line);
    if (!kv) {
      continue;
    }

    if (section === "meta") {
      const mapped = META_KEY_MAP[kv.key];
      if (mapped) {
        guides[lang].labels[mapped] = kv.value;
      }
      continue;
    }

    if (pendingStep) {
      if (kv.key === "menu") {
        pendingStep.menuLabel = kv.value;
      } else if (kv.key === "menu_href") {
        pendingStep.menuHref = kv.value;
      } else if (kv.key === "what") {
        pendingStep.what = kv.value;
      } else if (kv.key === "values") {
        pendingStep.values = kv.value;
      } else if (kv.key === "why") {
        pendingStep.why = kv.value;
      } else if (kv.key === "done") {
        pendingStep.done = kv.value;
      } else if (kv.key === "caution") {
        pendingStep.caution = kv.value;
      }
      continue;
    }

    if (pendingMenu) {
      if (kv.key === "menu_href") {
        pendingMenu.menuHref = kv.value;
      } else if (kv.key === "what") {
        pendingMenu.what = kv.value;
      } else if (kv.key === "values") {
        pendingMenu.values = kv.value;
      } else if (kv.key === "why") {
        pendingMenu.why = kv.value;
      }
      continue;
    }

    if (pendingFaq && kv.key === "a") {
      pendingFaq.a = kv.value;
    }
  }

  flush();
  return guides;
}
