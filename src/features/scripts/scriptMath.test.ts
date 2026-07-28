import { describe, expect, it } from 'vitest';
import { currentDoorScript, currentSurveyQuestions } from './scriptMath';
import type { ScriptEntryLike } from './scriptMath';

describe('currentDoorScript', () => {
  it('returns null when no door script has been entered', () => {
    expect(currentDoorScript([])).toBeNull();
  });

  it('ignores survey questions and retired scripts', () => {
    const entries: ScriptEntryLike[] = [
      { kind: 'door_script', content: 'Old script', sortOrder: 0, active: false },
      { kind: 'survey_question', content: 'Are you registered?', sortOrder: 0, active: true },
      { kind: 'door_script', content: 'Current script', sortOrder: 0, active: true }
    ];
    expect(currentDoorScript(entries)).toBe('Current script');
  });

  it('picks the most recently added active script when there are multiple', () => {
    const entries: ScriptEntryLike[] = [
      { kind: 'door_script', content: 'First', sortOrder: 0, active: true },
      { kind: 'door_script', content: 'Second', sortOrder: 0, active: true }
    ];
    expect(currentDoorScript(entries)).toBe('Second');
  });
});

describe('currentSurveyQuestions', () => {
  it('returns an empty list when no questions have been entered', () => {
    expect(currentSurveyQuestions([])).toEqual([]);
  });

  it('returns only active questions, sorted by real sort order', () => {
    const entries: ScriptEntryLike[] = [
      { kind: 'survey_question', content: 'Third', sortOrder: 2, active: true },
      { kind: 'survey_question', content: 'Retired', sortOrder: 1, active: false },
      { kind: 'survey_question', content: 'First', sortOrder: 0, active: true },
      { kind: 'door_script', content: 'Not a question', sortOrder: 0, active: true }
    ];
    expect(currentSurveyQuestions(entries)).toEqual(['First', 'Third']);
  });
});
