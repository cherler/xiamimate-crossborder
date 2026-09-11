/**
 * 跨境基础 Wiki —— 新手向的常青知识。
 *
 * 收录标准:①名词与概念,不是攻略;②十年内不会过时的骨架知识;
 * ③凡涉及会变的数字(费率/税率/政策)一律不写具体值,只讲结构与去哪核实。
 * 每个词条挂「相关工具」:认识了这个词,就能立刻上手算它。
 */

export type WikiEntry = {
  slug: string;
  term: string;
  en?: string;
  one: string;                 // 一句话:这是什么
  body: string;                // 两三句:怎么理解 / 常见误区
  tools?: Array<{ name: string; href: string }>;
};

export type WikiGroup = { key: string; title: string; note: string; entries: WikiEntry[] };

const T = {
  profit: { name: "利润计算器", href: "/crossborder/tools/profit-calculator" },
  pricing: { name: "定价决策模拟器", href: "/crossborder/tools/pricing-calculator" },
  acos: { name: "广告盈亏规划器", href: "/crossborder/tools/acos-break-even" },
  dimweight: { name: "计费重与包装优化器", href: "/crossborder/tools/dimensional-weight" },
  landed: { name: "进口到岸成本估算", href: "/crossborder/tools/landed-cost" },
  listing: { name: "Listing 诊断与改写", href: "/crossborder/workbench/listing-doctor" },
  voice: { name: "用户声音与竞品洞察", href: "/crossborder/workbench/voice-insight" },
};

export const WIKI_GROUPS: WikiGroup[] = [
  {
    key: "money",
    title: "钱怎么算",
    note: "跨境的账,先分清这几个词,再谈赚不赚。",
    entries: [
      {
        slug: "unit-profit", term: "单件净利润", en: "Unit Profit",
        one: "卖出一件商品,扣掉所有成本后真正到手的钱。",
        body: "口径要完整:售价 − 采购 − 物流(头程+尾程)− 平台佣金 − 广告 − 退款损耗。新手最常见的错是只扣采购和运费,把佣金、广告、退款忘在账外,看着赚、实际亏。",
        tools: [T.profit],
      },
      {
        slug: "gross-net", term: "毛利与净利", en: "Gross / Net Profit",
        one: "毛利只扣直接成本;净利把费用全部扣完。",
        body: "说「毛利 50%」不代表赚钱 —— 佣金、广告、退款、仓储都还没扣。谈生意用毛利,做决策看净利。",
        tools: [T.profit],
      },
      {
        slug: "breakeven-price", term: "保本售价", en: "Breakeven Price",
        one: "利润恰好为 0 的那个售价,是定价和促销的底线。",
        body: "低于保本价的每一单都在贴钱。做折扣、抢排名前先算出它,你才知道自己让利让到哪一档还活着。",
        tools: [T.profit, T.pricing],
      },
      {
        slug: "roi", term: "投入产出比", en: "ROI",
        one: "利润 ÷ 你实际垫进去的钱。",
        body: "分母是「自垫成本」:采购、物流这些你先掏的钱;佣金广告是平台从货款里扣的,不算垫付。同样净利率的两个商品,占用资金少的那个 ROI 更高、周转更快。",
        tools: [T.pricing],
      },
      {
        slug: "cashflow", term: "利润 ≠ 现金流", en: "Cash Flow",
        one: "账上有利润,手里可能没钱。",
        body: "备货压在海上和仓里、平台回款有账期、旺季前要囤更多货 —— 钱都被占着。很多跨境卖家不是亏死的,是「赚着钱但现金断了」。",
      },
      {
        slug: "fx", term: "汇率与汇损", en: "FX Exposure",
        one: "下单时和结汇时的汇率不一样,差价就是你的盈亏。",
        body: "采购用人民币、回款是外币,中间隔着几十天。汇率波动 2%,可能就吃掉你一小半净利。算账时给汇损留一档,而不是假设汇率不动。",
        tools: [T.profit],
      },
    ],
  },
  {
    key: "logistics",
    title: "物流与税",
    note: "货怎么过去、税怎么交 —— 词认对了,报价单才看得懂。",
    entries: [
      {
        slug: "first-last-mile", term: "头程与尾程", en: "First / Last Mile",
        one: "头程:从中国到目的国仓库;尾程:从仓库到买家手里。",
        body: "两段的计费方和规则完全不同:头程你找货代,按重量/体积计;尾程通常是平台或快递按件计。算单件物流成本时两段都要摊进去。",
        tools: [T.profit, T.landed],
      },
      {
        slug: "fba-fbm", term: "FBA 与 FBM", en: "Fulfillment",
        one: "FBA:平台仓发货;FBM:自己(或三方仓)发货。",
        body: "FBA 省心、有流量加成,但仓储费和旺季附加费是持续成本;FBM 灵活、利润空间可能更大,但物流时效和售后全靠自己。没有一定更好,只有算清哪种更适合这个商品。",
      },
      {
        slug: "dim-weight", term: "体积重与计费重", en: "Dimensional Weight",
        one: "轻抛货按体积折算重量收运费,取实重与体积重的较大者。",
        body: "长×宽×高÷除数就是体积重(除数各承运商不同)。一个大而轻的商品,运费按体积重算,可能比你想的贵一倍 —— 包装每省一厘米都是钱。",
        tools: [T.dimweight],
      },
      {
        slug: "incoterms", term: "贸易术语", en: "FOB / CIF / DDP",
        one: "一组约定「运费、保险、税费谁来付,风险到哪里交接」的国际暗号。",
        body: "FOB:货到出发港上船为止是卖家的事;CIF:卖家再多包运费和保险到目的港;DDP:一路包到门、税也是卖家交。看懂供应商报价里的这三个字母,才知道价格里含了什么。",
        tools: [T.landed],
      },
      {
        slug: "duty-hs", term: "关税与 HS 编码", en: "Duty & HS Code",
        one: "商品按 HS 编码归类,不同编码对应不同税率。",
        body: "HS 归类是判断题不是查表题:同一商品按材质或用途可能归入不同编码,税率差数倍。税率本身也会变 —— 永远以海关和报关行的现行裁定为准,别信任何「固定税率表」。",
        tools: [T.landed],
      },
      {
        slug: "vat", term: "VAT / GST", en: "Value-Added Tax",
        one: "目的国的流转税,通常按(货值+运费+关税)计征。",
        body: "欧洲叫 VAT、澳新叫 GST。有当地税号且合规申报时,进口缴的 VAT 往往可以抵扣 —— 它是垫付不是成本;没有税号就是纯成本。这一个区别直接改变你的到岸成本。",
        tools: [T.landed],
      },
      {
        slug: "landed-cost", term: "到岸成本", en: "Landed Cost",
        one: "货真正「落地进仓」的全部成本:货值+运保+关税+VAT+杂费。",
        body: "拿它除以件数,就是可以填进利润计算器「采购成本」的那个数。只用出厂价算利润,是新手第二常见的亏钱方式。",
        tools: [T.landed, T.profit],
      },
    ],
  },
  {
    key: "platform",
    title: "平台与广告",
    note: "平台的抽成和广告的口径,是账里最容易混的两块。",
    entries: [
      {
        slug: "referral-fee", term: "平台佣金", en: "Referral Fee",
        one: "平台按成交额抽的分成,类目不同比例不同。",
        body: "它按「售价」的百分比扣,所以你每提价一块钱,平台也多拿一份。有的类目还有最低佣金 —— 低价商品要特别当心这一条。",
        tools: [T.profit],
      },
      {
        slug: "acos", term: "ACoS", en: "Advertising Cost of Sales",
        one: "广告花费 ÷ 广告带来的销售额。",
        body: "它只看广告归因的那部分单。保本 ACoS = 毛利率:ACoS 高过它,广告带来的每一单都在亏。没有放之四海的「好 ACoS」,新品拉新和稳定盈利的合理区间完全不同。",
        tools: [T.acos],
      },
      {
        slug: "tacos", term: "TACoS", en: "Total ACoS",
        one: "广告花费 ÷ 全部销售额(不只广告单)。",
        body: "它衡量广告在整盘生意里的占比,和 ACoS 分母不同、不能直接比。利润计算器里的「广告成本 %」就是 TACoS 口径。两个词混用,是广告账算错的头号原因。",
        tools: [T.acos, T.profit],
      },
      {
        slug: "cpc-cvr", term: "CPC 与 CVR", en: "Cost per Click / Conversion Rate",
        one: "CPC:一次点击多少钱;CVR:多少点击换来一单。",
        body: "每单广告费 = CPC ÷ CVR。所以出价上限不该拍脑袋:先算出每单能承受的广告费,乘上你的真实转化率,就是 CPC 的天花板。",
        tools: [T.acos],
      },
      {
        slug: "refund-rate", term: "退款损耗", en: "Refund Loss",
        one: "退款、退货损坏、弃件摊到每一单上的隐形成本。",
        body: "退款不只是退货款:运费没了、佣金未必全退、货可能报废。按售价的一个百分比把它计入成本,比假装它不存在诚实得多。",
        tools: [T.profit],
      },
    ],
  },
  {
    key: "listing",
    title: "Listing 与运营",
    note: "商品页是你唯一的门面 —— 这些词决定它能不能被看到、敢不敢写。",
    entries: [
      {
        slug: "listing", term: "Listing", en: "Product Listing",
        one: "商品详情页:标题、图片、五点描述、A+、关键词的总和。",
        body: "它同时服务两个读者:搜索算法(决定你被谁看到)和真人买家(决定看到后买不买)。只讨好其中一个的 Listing 都做不长。",
        tools: [T.listing],
      },
      {
        slug: "keywords", term: "关键词", en: "Keywords",
        one: "买家搜索时敲进去的词,决定你的流量入口。",
        body: "写进标题和后台搜索词的关键词才可能被索引。堆砌无关词换不来转化,还稀释相关性 —— 关键词是覆盖「买家会怎么搜」,不是覆盖字典。",
        tools: [T.listing],
      },
      {
        slug: "review", term: "Review 与 Rating", en: "Reviews",
        one: "买家评论与星级 —— 转化率的放大器,也是问题的探测器。",
        body: "差评是免费的产品调研:批量读它,能找到图片没讲清的、尺寸误导的、质量真出问题的。刷评和诱导好评在主流平台都是高压线,代价远大于收益。",
        tools: [T.voice],
      },
      {
        slug: "compliance", term: "认证与合规", en: "Compliance",
        one: "目的国对特定品类的强制要求:认证、标签、材质声明。",
        body: "「防水」「食品级」「医用」这类词不是文案,是承诺 —— 写了就要有对应认证撑腰,否则轻则下架重则法律责任。资料里没有的,一个字都别写。",
        tools: [T.listing],
      },
    ],
  },
  {
    key: "tiktok",
    title: "TikTok Shop 专属",
    note: "内容驱动的货架,成本结构和亚马逊不是一回事 —— 这几个词不懂,账就算不对。",
    entries: [
      {
        slug: "affiliate-commission", term: "达人佣金", en: "Affiliate Commission",
        one: "达人帮你带货,按成交额抽走的分成。",
        body: "这是 TikTok Shop 与亚马逊**最大的成本结构差异** —— 亚马逊完全没有这一项。常见 5%–20%,按类目和达人逐个议价,叠加在平台佣金之上。新手最典型的算错就是只扣了平台佣金,把达人分佣忘在账外:一个 8% 平台佣金 + 15% 达人佣金的单子,实际被抽走 23%,而他以为是 8%。在利润计算器里用「达人佣金」成本模块单独列出来,别混进广告费。",
        tools: [T.profit, T.acos],
      },
      {
        slug: "sampling-cost", term: "寄样成本", en: "Sampling Cost",
        one: "寄给达人的样品,货值加运费,要分摊到它带来的订单上。",
        body: "达人带货前通常要免费样品。关键是**带不动货的那些样品也得算钱** —— 寄 20 个只有 3 个出了单,成本是 20 份样品分摊到那 3 个人带来的订单。只算成功那几个,等于把失败的成本藏起来了。用「寄样成本」模块按批次分摊,分母填你实际预计的订单数,别填理想值。",
        tools: [T.profit],
      },
      {
        slug: "roas", term: "ROAS", en: "Return on Ad Spend",
        one: "广告带来的成交额 ÷ 广告花费。ROAS 3 = 花 1 块换回 3 块成交。",
        body: "TikTok / 信息流投放的通用口径,和亚马逊的 ACoS 是同一件事的两种说法:ROAS = 100 ÷ ACoS。保本 ACoS 35% 就是保本 ROAS 2.9。注意 ROAS 算的是**成交额**不是利润 —— ROAS 3 不代表赚钱,得先知道你的保本线在哪。广告盈亏规划器两个口径都给。",
        tools: [T.acos],
      },
      {
        slug: "gpm", term: "GPM(千次观看成交额)", en: "GMV per Mille",
        one: "每一千次视频观看带来多少成交额。内容效率的核心指标。",
        body: "GPM = 成交额 ÷ 观看数 × 1000。它衡量的是「这条内容值不值得投流」:GPM 高说明内容和商品匹配,加投能放大;GPM 低就算 ROAS 一时好看也难放量。亚马逊的漏斗是「曝光→点击→成交」,TikTok 多一层「观看」—— 一条视频可能几十万播放却零成交,这在亚马逊的指标体系里没有对应物。",
        tools: [T.acos],
      },
      {
        slug: "content-vs-shelf", term: "内容场 vs 货架场", en: "Content vs Shelf",
        one: "TikTok 的单既可能来自短视频/直播,也可能来自商城搜索。",
        body: "内容场靠推荐算法把商品推给还没打算买的人 —— 冲动成交多、退货率也高;货架场(商城/搜索)接近亚马逊逻辑,是有明确需求的人来找。两者的转化率、退货率、广告效率完全不同,混在一起算平均值会两头都不准。做账时至少心里分开。",
        tools: [T.profit],
      },
      {
        slug: "fbt", term: "FBT(平台仓配)", en: "Fulfilled by TikTok",
        one: "TikTok 的官方仓配服务,类似亚马逊 FBA,但只在部分市场提供。",
        body: "多数 TikTok 卖家仍是**自发货**,这与亚马逊「默认 FBA」的心智相反。自发货意味着尾程成本、时效和售后都在你自己身上,而平台对发货时效的考核相当严。算账时「尾程/FBA」这一栏要填你真实的快递成本,不能套用 FBA 费率表。",
        tools: [T.profit, T.dimweight],
      },
      {
        slug: "shop-score", term: "小店体验分", en: "Shop Performance Score",
        one: "平台对店铺的综合评分,直接影响流量分配和能不能报活动。",
        body: "考核维度包括发货时效、退款率、纠纷率、商品体验等。分数掉下去不只是少点流量 —— 可能失去参加大促、开通达人广场的资格,严重的会限制经营。它不是「运营优化项」,是**经营的生死线**,尤其对自发货卖家。",
        tools: [],
      },
      {
        slug: "return-rate-tiktok", term: "退货率(内容电商口径)", en: "Return Rate",
        one: "冲动下单带来的退货,通常显著高于亚马逊同类目。",
        body: "内容场的成交很多是「刷到就买」,决策链条短,收到货后的预期落差比搜索场大。做利润测算时,如果直接套用亚马逊的退款损耗假设,利润会系统性高估。宁可先按偏高的比例试算,跑出真实数据再往回调。",
        tools: [T.profit],
      },
    ],
  },
];

/** 词条总数(入口页展示用)。 */
export const WIKI_COUNT = WIKI_GROUPS.reduce((n, g) => n + g.entries.length, 0);
