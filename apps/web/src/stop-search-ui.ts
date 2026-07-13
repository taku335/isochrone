import { searchStopGroups, type StopGroup } from './stop-search.js';

export interface StopSearchUiOptions {
  readonly root: HTMLElement;
  readonly groups: readonly StopGroup[];
  readonly onSelect: (group: StopGroup) => void;
  readonly onClear?: () => void;
}

export interface StopSearchUiController {
  readonly select: (group: StopGroup) => void;
  readonly dispose: () => void;
}

export function initializeStopSearchUi(options: StopSearchUiOptions): StopSearchUiController {
  const input = options.root.querySelector<HTMLInputElement>('.stop-search-input');
  const clearButton = options.root.querySelector<HTMLButtonElement>('.stop-search-clear');
  const resultsElement = options.root.querySelector<HTMLDivElement>('.stop-search-results');
  const selectionElement = options.root.querySelector<HTMLParagraphElement>('.stop-selection');
  if (input === null || clearButton === null || resultsElement === null || selectionElement === null) {
    throw new Error('Stop search controls were not found.');
  }

  let results: readonly StopGroup[] = [];
  let activeIndex = -1;
  let hasSelection = false;

  const select = (group: StopGroup): void => {
    input.value = group.name;
    clearButton.hidden = false;
    results = [];
    activeIndex = -1;
    renderResults();
    selectionElement.hidden = false;
    selectionElement.textContent = `${String(group.stopIndices.length)}のりばを出発地に設定`;
    hasSelection = true;
    options.onSelect(group);
  };

  const renderResults = (): void => {
    resultsElement.replaceChildren();
    resultsElement.hidden = results.length === 0;
    input.setAttribute('aria-expanded', String(results.length > 0));
    input.removeAttribute('aria-activedescendant');
    results.forEach((group, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'stop-search-option';
      option.id = `stop-search-option-${String(index)}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(index === activeIndex));
      option.innerHTML = `
        <span class="stop-option-name">${escapeHtml(group.name)}</span>
        <span class="stop-option-detail">${escapeHtml(group.kana ?? '')}</span>
        <span class="stop-option-count">${String(group.stopIndices.length)}のりば</span>
      `;
      option.addEventListener('click', () => {
        select(group);
      });
      resultsElement.append(option);
    });
    if (activeIndex >= 0) {
      const activeId = `stop-search-option-${String(activeIndex)}`;
      input.setAttribute('aria-activedescendant', activeId);
      document.querySelector(`#${activeId}`)?.scrollIntoView({ block: 'nearest' });
    }
  };

  const updateResults = (): void => {
    if (hasSelection) {
      hasSelection = false;
      options.onClear?.();
    }
    results = searchStopGroups(options.groups, input.value);
    activeIndex = results.length === 0 ? -1 : 0;
    clearButton.hidden = input.value.length === 0;
    selectionElement.hidden = true;
    renderResults();
  };

  const handleKeydown = (event: KeyboardEvent): void => {
    if (results.length === 0) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % results.length;
      renderResults();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = (activeIndex - 1 + results.length) % results.length;
      renderResults();
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      const group = results[activeIndex];
      if (group !== undefined) {
        select(group);
      }
    } else if (event.key === 'Escape') {
      results = [];
      activeIndex = -1;
      renderResults();
    }
  };

  const clear = (): void => {
    input.value = '';
    clearButton.hidden = true;
    selectionElement.hidden = true;
    results = [];
    activeIndex = -1;
    if (hasSelection) {
      hasSelection = false;
      options.onClear?.();
    }
    renderResults();
    input.focus();
  };

  input.disabled = false;
  input.addEventListener('input', updateResults);
  input.addEventListener('keydown', handleKeydown);
  clearButton.addEventListener('click', clear);
  return {
    select,
    dispose: () => {
      input.removeEventListener('input', updateResults);
      input.removeEventListener('keydown', handleKeydown);
      clearButton.removeEventListener('click', clear);
    },
  };
}

function escapeHtml(value: string): string {
  const element = document.createElement('span');
  element.textContent = value;
  return element.innerHTML;
}
