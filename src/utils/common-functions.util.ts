export function formatDate(opportunityCreatedDate: string) {
  const date: Date = new Date(opportunityCreatedDate);

  const formattedDate = `${new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
  }).format(date)}`;

  return formattedDate;
}
