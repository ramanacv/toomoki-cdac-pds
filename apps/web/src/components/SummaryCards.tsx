import { Card } from '@/components/ui/card';

type SummaryCardsProps = {
  cards: Array<[string, string]>;
};

export function SummaryCards({ cards }: SummaryCardsProps) {
  return (
    <section
      className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4"
      aria-label="Dashboard summary metrics"
    >
      {cards.map(([label, value]) => (
        <Card key={label} className="rounded-3xl p-5">
          <p className="text-sm text-muted-foreground">{label}</p>
          <strong className="mt-2 block text-3xl font-semibold tracking-tight">{value}</strong>
        </Card>
      ))}
    </section>
  );
}
