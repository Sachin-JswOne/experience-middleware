/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
export function formatDate(opportunityCreatedDate: string) {
  const date: Date = new Date(opportunityCreatedDate);

  const formattedDate = `${new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
  }).format(date)}`;

  return formattedDate;
}

export function toTitleCase(str: string): string {
  const withSpaces = str.replace(/([a-z])([A-Z])/g, '$1 $2');

  return withSpaces
    .split(/[\s_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function convertToDouble(strNumber) {
  const convertedNumber = strNumber.replace(/,/g, '');

  const doubleNumber = parseFloat(convertedNumber);

  return doubleNumber;
}
