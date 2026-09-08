import type { OpenQuestion } from '@goodboy/types';
import { SectionSurface } from '@goodboy/ui';
import { AnswerSubmitButton } from '../../../../context/components/QuestionsTab/AnswerSubmitButton';
import { QuestionCard } from '../../../../context/components/QuestionsTab/QuestionCard';
import {
  deriveDraftAnswer,
  useOpenQuestions,
} from '../../../../context/components/QuestionsTab/useOpenQuestions';

type Props = {
  readonly question: OpenQuestion | null;
  readonly fallbackText: string | null;
  readonly onSend: (params: { readonly question: OpenQuestion; readonly answer: string }) => void;
};

export const QuestionSection = ({ question, fallbackText, onSend }: Props) => {
  const drafts = useOpenQuestions((state) => state.drafts);
  const toggleSuggestion = useOpenQuestions((state) => state.toggleSuggestion);
  const setCustomAnswer = useOpenQuestions((state) => state.setCustomAnswer);
  const toggleCustomField = useOpenQuestions((state) => state.toggleCustomField);
  const clearJustAnswered = useOpenQuestions((state) => state.clearJustAnswered);
  const justAnswered = useOpenQuestions((state) => state.justAnswered);
  if (question === null) {
    return fallbackText === null ? null : (
      <SectionSurface label="Question">
        <p className="text-sm leading-relaxed text-foreground">{fallbackText}</p>
      </SectionSurface>
    );
  }
  const draft = drafts[question.id];
  const answer = deriveDraftAnswer(draft);
  return (
    <SectionSurface label="Question">
      <QuestionCard
        question={question}
        selectedSuggestions={draft?.selectedSuggestions ?? []}
        customAnswer={draft?.customAnswer ?? ''}
        showCustomField={draft?.showCustomField ?? true}
        justAnswered={justAnswered.includes(question.id)}
        onToggleSuggestion={toggleSuggestion}
        onSetCustomAnswer={setCustomAnswer}
        onToggleCustomField={toggleCustomField}
        onDismiss={() => undefined}
        onClearJustAnswered={clearJustAnswered}
      />
      <AnswerSubmitButton
        answerCount={answer.trim() === '' ? 0 : 1}
        totalCount={1}
        label="Send answer"
        onClick={() => onSend({ question, answer })}
      />
    </SectionSurface>
  );
};
