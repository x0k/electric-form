export interface HeaderState {
  title: string;
  backHref: string | null;
}

const DEFAULT_HEADER: HeaderState = {
  title: 'Проекты электрики',
  backHref: null,
};

let title = $state(DEFAULT_HEADER.title);
let backHref = $state<string | null>(DEFAULT_HEADER.backHref);

export const header = {
  get title() {
    return title;
  },
  get backHref() {
    return backHref;
  },
};

export function setHeader(state: HeaderState) {
  title = state.title;
  backHref = state.backHref;
}

export function resetHeader() {
  title = DEFAULT_HEADER.title;
  backHref = DEFAULT_HEADER.backHref;
}
