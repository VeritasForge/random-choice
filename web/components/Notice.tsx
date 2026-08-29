type Action = { label: string; onClick: () => void };

type Props = {
  title: string;
  description: string;
  actions: Action[];
};

/** 오류나 빈 결과를 알리고, 다음에 할 수 있는 일을 버튼으로 보여준다. */
export default function Notice({ title, description, actions }: Props) {
  return (
    <section className="flex flex-col items-center gap-4 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-neutral-500">{description}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            className="rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}
