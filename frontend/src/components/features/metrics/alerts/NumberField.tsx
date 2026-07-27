import { TextField } from '@mui/material';

const numberOrNull = (raw: string): number | null => {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  return isNaN(value) || value <= 0 ? null : value;
};

/**
 * Threshold input. An empty field means "check disabled", so the value is
 * `number | null` rather than a string, and non-positive input is rejected.
 */
const NumberField = ({
  label,
  value,
  onChange,
  width,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  width?: number;
}) => (
  <TextField
    label={label}
    type="number"
    size="small"
    fullWidth={width === undefined}
    value={value ?? ''}
    onChange={(e) => onChange(numberOrNull(e.target.value))}
    sx={width !== undefined ? { width } : undefined}
  />
);

export default NumberField;
