type Props = { onStart: () => void }
export default function LandingPage({ onStart }: Props) {
  return <main className="landing-page">
    <div className="landing-brand"><span lang="zh-CN" aria-hidden="true">汉</span> Hanzi</div>
    <div className="landing-content"><h1>Learn Chinese.</h1><p>Practise vocabulary, speaking, writing characters and building sentences.</p><button className="primary-btn" type="button" onClick={onStart}>Start learning</button></div>
    <div className="landing-character" lang="zh-CN" aria-hidden="true">学<span lang="en">xué · to learn</span></div>
  </main>
}
