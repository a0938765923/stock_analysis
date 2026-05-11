(function () {
  'use strict';
  window.__chartAI = window.__chartAI || {};

  // ── Volume Profile knowledge base ────────────────────────────────────────
  // Source: TradingView support docs, tradingindepth.com, quantvue.io

  const VOLUME_PROFILE = {
    concepts: [
      {
        id: 'poc',
        name_zh: '控制點 POC',
        name_en: 'Point of Control',
        desc: '成交量最大的價格水平，代表市場公允價值（Fair Value），是最重要的參考基準',
        trading_signal: '價格傾向回歸POC（磁鐵效應）；POC本身是強支撐/強壓力；遠離POC越多，均值回歸動力越強'
      },
      {
        id: 'vah',
        name_zh: '價值區上緣 VAH',
        name_en: 'Value Area High',
        desc: '含有70%成交量的區間上邊界，代表買方願意接受的最高公允價格',
        trading_signal: '下方看多：VAH是空頭壓力區，站上VAH且守住為突破信號；上方看多：回踩VAH支撐為追多機會'
      },
      {
        id: 'val',
        name_zh: '價值區下緣 VAL',
        name_en: 'Value Area Low',
        desc: '含有70%成交量的區間下邊界，代表賣方願意接受的最低公允價格',
        trading_signal: '上方看多：VAL是多頭支撐區，跌破VAL且守不住為看空信號；下方做空：反彈至VAL壓力為做空機會'
      },
      {
        id: 'hvn',
        name_zh: '高量節點 HVN',
        name_en: 'High Volume Node',
        desc: '成交量密集的價格區域，代表多空雙方在此達成大量共識，是市場均衡區',
        trading_signal: '價格在HVN區會放慢腳步甚至橫盤；HVN是強支撐/壓力區；跌破HVN後容易加速'
      },
      {
        id: 'lvn',
        name_zh: '低量節點 LVN',
        name_en: 'Low Volume Node',
        desc: '成交量稀少的價格區域，代表市場快速通過此區，買賣雙方對此價位無共識',
        trading_signal: '價格通過LVN時速度快；LVN是薄弱支撐/壓力，容易被穿透；是突破加速的「真空區」'
      }
    ],
    strategies: {
      in_range: '在POC附近做均值回歸；VAH做空、VAL做多（區間策略）',
      breakout: '突破VAH且站穩→多頭目標看Profile High；跌破VAL且守不住→空頭目標看Profile Low',
      reentry: '突破後回踩VAH（原壓力轉支撐）是最佳追多點；回踩VAL（原支撐轉壓力）是最佳追空點'
    }
  };

  // ── Volume Footprint / Order Flow knowledge base ─────────────────────────
  // Source: TradingView support docs, litefinance.org, bookmap.com

  const VOLUME_FOOTPRINT = {
    concepts: [
      {
        id: 'delta',
        name_zh: '成交量差值 Delta',
        name_en: 'Volume Delta',
        desc: '主動買量（市價買單）減主動賣量（市價賣單）的差值。正Delta = 買方積極；負Delta = 賣方積極',
        trading_signal: '正Delta + 上漲K線 = 健康上漲；負Delta + 下跌K線 = 健康下跌'
      },
      {
        id: 'delta_divergence',
        name_zh: 'Delta背離',
        name_en: 'Delta Divergence',
        desc: '價格與Delta方向相反：如價格上漲但Delta為負（賣方積極卻漲），或價格下跌但Delta為正',
        trading_signal: '看漲背離：價格下跌但Delta持續為正（買方在承接賣壓）→底部反轉信號；看跌背離：價格上漲但Delta為負→頂部信號'
      },
      {
        id: 'imbalance',
        name_zh: '成交量失衡',
        name_en: 'Volume Imbalance',
        desc: '在同一根K線中，某個價格水平的買量超過賣量300%（或以上），或反之',
        trading_signal: '大量買方失衡（藍格）= 機構積極吃貨，支撐強；大量賣方失衡（紅格）= 機構積極拋貨，壓力強；堆疊多層同向失衡 = 強趨勢'
      },
      {
        id: 'absorption',
        name_zh: '成交量吸收',
        name_en: 'Volume Absorption',
        desc: '大量市場買單或賣單湧入，但價格幾乎沒有移動（被大掛單吸收）',
        trading_signal: '在支撐位出現大量賣單但價格不跌 = 有大買家在吸收 = 看多；在壓力位出現大量買單但價格不漲 = 有大賣家在吸收 = 看空'
      },
      {
        id: 'cvd',
        name_zh: '累積成交量差值 CVD',
        name_en: 'Cumulative Volume Delta',
        desc: '當日Delta的累積值，顯示整個交易日買賣方的淨力量變化趨勢',
        trading_signal: 'CVD上升 + 價格上漲 = 強烈看多確認；CVD背離（價格漲但CVD跌）= 上漲動能衰竭，頂部警示'
      },
      {
        id: 'stacked_imbalance',
        name_zh: '堆疊失衡',
        name_en: 'Stacked Imbalance',
        desc: '連續多個相鄰價格水平均出現同方向的失衡，形成失衡牆',
        trading_signal: '買方堆疊失衡 = 強力支撐牆，突破後強力看多；賣方堆疊失衡 = 強力壓力牆，突破後強力看空'
      }
    ],
    reading_guide: '注意：Footprint圖需要TradingView付費方案才能顯示。若截圖中無Footprint，AI將依據標準成交量柱 + 量價關係推斷訂單流特性。'
  };

  function buildVolumeAnalysisRef() {
    const vpLines = VOLUME_PROFILE.concepts.map(c =>
      `  ・${c.name_zh}（${c.name_en}）：${c.desc}\n    → 交易信號：${c.trading_signal}`
    ).join('\n\n');

    const vfLines = VOLUME_FOOTPRINT.concepts.map(c =>
      `  ・${c.name_zh}（${c.name_en}）：${c.desc}\n    → 交易信號：${c.trading_signal}`
    ).join('\n\n');

    return (
      '【量價分析（Volume Profile + Volume Footprint）參考字典】\n\n' +

      '▶ Volume Profile — 量能分布分析：\n' +
      '（若截圖中顯示了Volume Profile直方圖，請識別以下價位）\n\n' +
      vpLines + '\n\n' +
      '  策略應用：\n' +
      '  ' + VOLUME_PROFILE.strategies.in_range + '\n' +
      '  ' + VOLUME_PROFILE.strategies.breakout + '\n' +
      '  ' + VOLUME_PROFILE.strategies.reentry + '\n\n' +

      '▶ Volume Footprint / Order Flow — 訂單流分析：\n' +
      '（若截圖顯示Footprint圖或CVD指標，請識別以下信號；若無則依據標準量柱推斷）\n\n' +
      vfLines + '\n\n' +
      '  注意：' + VOLUME_FOOTPRINT.reading_guide + '\n\n' +

      '識別要求：①是否可見Volume Profile → 識別POC/VAH/VAL/HVN/LVN具體價位 ②成交量結構（是否量縮回調/放量突破/量價背離）③若有Delta/Footprint資訊請說明Delta方向與是否存在背離或吸收\n'
    );
  }

  Object.assign(window.__chartAI, {
    VOLUME_PROFILE,
    VOLUME_FOOTPRINT,
    buildVolumeAnalysisRef
  });
})();
