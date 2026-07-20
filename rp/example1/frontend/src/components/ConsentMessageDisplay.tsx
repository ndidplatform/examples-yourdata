import type { ConsentMessageData } from '@/domain/types'

interface Props {
  data: ConsentMessageData
}

export function ConsentMessageDisplay({ data }: Props) {
  return (
    <div className="leading-relaxed space-y-3" style={{ fontSize: 13, color: '#334155' }}>
      <p className="font-bold" style={{ color: '#0F172A' }}>
        ความยินยอมในการเปิดเผยข้อมูลเพื่อ
        <span style={{ color: '#D97706' }}> {data.purpose}</span>
      </p>
      <p>คุณกำลังยืนยันตัวเองเพื่อให้ความยินยอมในการเปิดเผยข้อมูลจาก</p>
      <ol className="list-decimal list-inside space-y-2">
        {data.dpItems.map((dp, i) => (
          <li key={i}>
            <span className="font-semibold">{dp.dpName}</span>
          </li>
        ))}
      </ol>
      <p>
        ตามบัญชีที่คุณเลือก หรือจะเลือกในขั้นตอนถัดไป ให้แก่
        <span className="font-semibold"> {data.dcName}</span> เพื่อ{data.purpose}ในครั้งนี้เท่านั้น
      </p>
      {data.consentExpiryDate && (
        <p>
          โดยผู้ส่งข้อมูลจะเปิดเผยข้อมูลดังกล่าวให้แก่ผู้รับข้อมูลถึง
          <span className="font-semibold"> {data.consentExpiryDate}</span>
        </p>
      )}
      <p>
        ทั้งนี้ กรณีที่คุณไม่ให้ความยินยอม จะมีผลให้ผู้ส่งข้อมูลไม่สามารถเปิดเผยข้อมูลตามความประสงค์ของคุณได้
        และอาจทำให้คุณไม่ได้รับบริการ{data.purpose}
      </p>
      <p style={{ fontSize: 11, color: '#94A3B8' }}>
        โปรดอ่านเพิ่มเติมเกี่ยวกับประกาศนโยบายความเป็นส่วนตัวของผู้ส่งข้อมูลและผู้รับข้อมูล
        เพื่อเข้าใจวิธีการเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคลของคุณและสิทธิของคุณ
        โดยสามารถดูรายละเอียดที่เว็บไซต์ของบุคคลดังกล่าว
      </p>
    </div>
  )
}
