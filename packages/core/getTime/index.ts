import { isDate } from '@tachikoma/shared'


export const getTime = (date: Date | string | number): number => {
  const d = isDate(date) ? date : new Date(date);
  return d.getTime();
}