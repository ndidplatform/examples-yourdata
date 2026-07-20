interface Props {
  masked: string
}

export function MaskedAccountNumber({ masked }: Props) {
  return <span className="font-mono text-sm text-slate-500">{masked}</span>
}
