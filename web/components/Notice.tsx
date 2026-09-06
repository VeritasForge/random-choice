type Action = { label: string; onClick: () => void };

type Props = {
  title: string;
  description: string;
  actions: Action[];
};

/** 오류나 빈 결과를 알리고, 다음에 할 수 있는 일을 버튼으로 보여준다. */
export default function Notice({ title, description, actions }: Props) {
  return (
    // grow·my-auto로 버튼 묶음을 화면 아래쪽에 붙인다(까닭은 StartScreen에 적어 두었다).
    <section className="rise flex w-full grow flex-col">
      <div className="my-auto flex flex-col items-center gap-4 py-8 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-balance break-keep">{title}</h2>
        <p className="max-w-sm text-base leading-relaxed text-muted">{description}</p>
      </div>
      <div className="flex w-full flex-col gap-3">
        {actions.map((action, index) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            /*
              맨 앞의 것만 강조색으로 칠한다. 막다른 화면에서 다음 걸음이 무엇인지
              한눈에 보여야 하고, 강조색이 둘 이상이면 그 구실을 못 한다.
              반경을 넓히는 화면에서는 가장 좁은(=가장 먼저 해 볼) 반경이 맨 앞이다.
            */
            className={`btn w-full ${index === 0 ? "btn-primary" : "btn-quiet"}`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}
