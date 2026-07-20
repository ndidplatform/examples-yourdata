import type { ConsentMessageData } from '@/domain/types'

export function buildConsentMessage(data: ConsentMessageData): string {
  const lines: string[] = []

  lines.push(`ความยินยอมในการเปิดเผยข้อมูลเพื่อ${data.purpose}`)
  lines.push('')
  lines.push('คุณกำลังยืนยันตัวเองเพื่อให้ความยินยอมในการเปิดเผยข้อมูลจาก')
  lines.push('')

  data.dpItems.forEach((dp, index) => {
    lines.push(`${index + 1}. ${dp.dpName} (บัญชี: ${dp.accountRef}):`)
    dp.datasets.forEach(ds => {
      lines.push(`- ${ds.name}: ${ds.permission}`)
    })
    lines.push('')
  })

  lines.push(
    `ตามบัญชีที่คุณเลือก หรือจะเลือกในขั้นตอนถัดไป ให้แก่${data.dcName} เพื่อ${data.purpose}ในครั้งนี้เท่านั้น`
  )
  lines.push('')

  if (data.consentExpiryDate) {
    lines.push(
      `โดยผู้ส่งข้อมูลจะเปิดเผยข้อมูลดังกล่าวให้แก่ผู้รับข้อมูลถึง${data.consentExpiryDate} ตามที่คุณได้ให้ความยินยอมนี้`
    )
    lines.push('')
  }

  lines.push(
    `ทั้งนี้ กรณีที่คุณไม่ให้ความยินยอม จะมีผลให้ผู้ส่งข้อมูลไม่สามารถเปิดเผยข้อมูลตามความประสงค์ของคุณได้ และอาจทำให้คุณไม่ได้รับบริการ${data.purpose}`
  )
  lines.push('')
  lines.push(
    'โปรดอ่านเพิ่มเติมเกี่ยวกับประกาศนโยบายความเป็นส่วนตัวของผู้ส่งข้อมูลและผู้รับข้อมูลเพื่อเข้าใจวิธีการเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคลของคุณและสิทธิของคุณ โดยสามารถดูรายละเอียดที่เว็บไซต์ของบุคคลดังกล่าว'
  )

  return lines.join('\n')
}
