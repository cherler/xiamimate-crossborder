"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Download, Info, Package, Puzzle, X } from "lucide-react";
import { SiteLink } from "../site-link";
import { REPO_URL } from "../../lib/site";

const CAPTURED = [
  { title: "商品信息", description: "标题、品牌、页面价格、主图、类目与商品要点", platform: "两个平台" },
  { title: "竞争位置", description: "评分、评价数、大类排名、上架时间、卖家与履约方式", platform: "亚马逊" },
  { title: "已售数量", description: "商品页面公开显示的累计销量", platform: "TikTok Shop" },
  { title: "平台口碑主题", description: "亚马逊展示的口碑摘要、主题及提及计数，单独保留来源", platform: "亚马逊" },
  { title: "评论原文", description: "当前已加载的评论、评分、款式与时间，不含评论人身份", platform: "两个平台" },
];

const STEPS = [
  { title: "下载并解压", body: "下载上面的安装包，解压出一个文件夹。放在你不会随手删掉的地方，浏览器需要一直从这个文件夹加载扩展。" },
  { title: "打开扩展管理页", body: "在浏览器地址栏输入 chrome://extensions 回车。Edge 使用 edge://extensions。" },
  { title: "打开右上角「开发者模式」", body: "手动安装需要启用开发者模式，打开后会显示加载扩展的按钮。" },
  { title: "点「加载已解压的扩展程序」", body: "选择刚才解压出来的文件夹本身，里面应该能看到 manifest.json。不要选择 ZIP 或文件夹里的某个文件。" },
  { title: "把它固定到工具栏", body: "点浏览器右上角的拼图图标，找到「虾米跨境采集助手」，点旁边的图钉。打开商品详情页后，点插件就能采集。" },
  { title: "采集、导出，再确认导入", body: "在插件里点击「采集本页商品」，再点「导出商品与评论 JSON」。回到本页的「导入采集文件」，核对商品、站点和来源后确认，资料就会进入本地商品档案。" },
];
const PLATFORMS = [
  { name: "亚马逊", page: "网址带 /dp/ 的商品详情页", sites: "amazon.com、amazon.co.uk、amazon.de、amazon.fr、amazon.it、amazon.es、amazon.co.jp、amazon.ca、amazon.com.au、amazon.com.mx" },
  { name: "TikTok Shop", page: "网址带 /pdp/ 的商品详情页", sites: "shop.tiktok.com、tiktok.com" },
];
const YES = [
  "在你点击采集时，读取当前商品页公开展示的商品信息",
  "保存已加载的评论原文、评分与采样范围，重复评论自动跳过",
  "读取页面上的平台口碑摘要，并与本地评论样本分开保存",
  "导出文件，由你核对并确认后写入本地商品档案",
];
const NO = [
  "读取 Cookie、密码、浏览历史或评论人姓名与主页",
  "在你未点击采集时读取页面，或自动翻页、后台运行、批量抓取",
  "自动上传资料，或访问你在网页中保存的商品档案",
  "把当前页面的评论样本当作完整评论库",
];
const PERMISSIONS = [
  { name: "activeTab", why: "点击插件后，临时获得当前这一个标签页的读取权限。" },
  { name: "scripting", why: "点击采集时，在当前页面执行一次采集脚本，不常驻。" },
  { name: "storage", why: "在本机保存采集结果与评论篮，导出文件后仍然保留。" },
];

function IntroSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return <section id={id} className="content-section"><h2>{title}</h2>{children}</section>;
}

export function ExtensionIntro({ version }: { version: string }) {
  const [showSteps, setShowSteps] = useState(true);
  return (
    <>
      <nav className="ext-quicknav" aria-label="采集助手快捷入口">
        <SiteLink className="ext-btn-ghost" href="/extension/import/"><Package size={14} /> 导入采集文件</SiteLink>
        <SiteLink className="ext-btn-ghost" href="/crossborder/my/">我的商品档案</SiteLink>
        <SiteLink className="ext-btn-ghost" href="#capture-privacy">数据与权限</SiteLink>
      </nav>

      <section className="ext-card ext-dl" aria-label="下载安装包">
        <div className="ext-dl-main">
          <div className="ext-dl-ic"><Puzzle size={20} /></div>
          <div>
            <div className="ext-dl-title">虾米跨境采集助手 v{version}</div>
            <div className="ext-dim">Chrome / Edge / 其它 Chromium 内核浏览器</div>
          </div>
          <div className="ext-dl-acts">
            <SiteLink className="ext-btn" href={"/downloads/xiamimate-collector-" + version + ".zip"} download>
              <Download size={14} /> 下载安装包
            </SiteLink>
          </div>
        </div>
        <p className="ext-warn ext-install-note"><Info size={14} /> 当前提供手动安装包，按下方步骤加载即可使用。此版本没有商店自动更新，更新时替换原文件夹内容，再到扩展管理页点「重新加载」。</p>
      </section>

      <IntroSection title="它解决什么">
        <p>做跨境要反复看商品页：价格、评分、评价数、排名、上架时间、卖家与履约方式。这些数字要一个个抄进表格，换个竞品还要再来一遍。</p>
        <p>扩展把采集变成<b>一次点击</b>。导出文件、核对并导入后，下面这些资料就留在商品档案里，可继续用于评论分析与深度研究。</p>
        <dl className="ext-captured">
          {CAPTURED.map((item) => (
            <div key={item.title}>
              <dt>{item.title}<span className="ext-on">{item.platform}</span></dt>
              <dd>{item.description}</dd>
            </div>
          ))}
        </dl>
        <p className="ext-note-line">「平台口碑主题」是亚马逊自己展示的统计，<b>与插件采集的评论原文不是同一批数据</b>。两者会分别标注；没读到的字段会留空，评论只覆盖你实际打开的页面。</p>
        <div className="ext-sites">
          <div className="ext-sites-t">目前支持这些站点</div>
          {PLATFORMS.map((platform) => (
            <div key={platform.name} className="ext-sites-row">
              <b>{platform.name}</b><span className="ext-sites-p">{platform.page}</span>
              <div>{platform.sites}</div>
            </div>
          ))}
        </div>
      </IntroSection>

      <IntroSection title="手动安装">
        <button className="pd-more" onClick={() => setShowSteps((value) => !value)} aria-expanded={showSteps} aria-controls="extension-install-steps">
          <ChevronDown size={13} className={showSteps ? "pd-more-open" : ""} />
          手动安装步骤（{STEPS.length} 步）
        </button>
        <ol id="extension-install-steps" className="ext-steps" hidden={!showSteps}>
          {STEPS.map((step, index) => (
            <li key={step.title}><b>{index + 1}. {step.title}</b><p>{step.body}</p></li>
          ))}
        </ol>
      </IntroSection>

      <IntroSection title="装好之后">
        <p>打开<b>商品详情页</b>，展开想保留的评论，点击插件里的「采集本页商品」或「重新采集本页评论」。手动翻到下一页后再次采集，重复评论会自动跳过，每篮最多保留 500 条。</p>
        <p>点击「导出商品与评论 JSON」保存文件，再打开 <SiteLink href="/extension/import/">导入采集文件</SiteLink>，核对商品、站点、字段与来源后确认。原采集结果仍保留在插件中。</p>
        <p className="ext-dim">确认导入后，可以在评论分析工作台读取样本，也可以到深度研究整理证据、对比商品和保存底稿。采集价格作为观察资料保存，不会覆盖你填写的测算成本与售价。</p>
        <div className="ext-actions">
          <SiteLink className="ext-btn-ghost" href="/crossborder/workbench/voice-insight/">查看评论样本</SiteLink>
          <SiteLink className="ext-btn-ghost" href="/crossborder/research/">进入深度研究 →</SiteLink>
        </div>
      </IntroSection>

      <IntroSection id="capture-privacy" title="它读什么、不读什么">
        <ul className="ext-list ext-list-yes">{YES.map((text) => <li key={text}><Check size={14} /> {text}</li>)}</ul>
        <h3 className="ext-sub">它做不到</h3>
        <ul className="ext-list ext-list-no">{NO.map((text) => <li key={text}><X size={14} /> {text}</li>)}</ul>
        <h3 className="ext-sub">为什么只要这几个权限</h3>
        <div className="ext-perms">{PERMISSIONS.map((permission) => (
          <div key={permission.name}><code>{permission.name}</code><span>{permission.why}</span></div>
        ))}</div>
        <p className="ext-dim">插件没有后台常驻进程，也没有商品站点的常驻读取权限。资料保存在本机，导出的文件由你选择是否导入网页。</p>
        <p className="ext-dim">目标页面改版、内容未加载或访问受限时可能无法采集。清除浏览器数据或卸载扩展前，请先导出需要保留的文件。</p>
        <div className="ext-actions"><SiteLink className="rc-start" href={REPO_URL + "/tree/main/extension"} target="_blank" rel="noreferrer">查看插件开源代码 →</SiteLink></div>
      </IntroSection>
    </>
  );
}
