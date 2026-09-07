document.addEventListener("DOMContentLoaded", () => {
  const reviewInput = document.getElementById("reviewInput");
  const charCount = document.getElementById("charCount");
  const thresholdRange = document.getElementById("thresholdRange");
  const thresholdValue = document.getElementById("thresholdValue");
  const analyzeBtn = document.getElementById("analyzeBtn");
  
  const emptyState = document.getElementById("emptyState");
  const resultsContent = document.getElementById("resultsContent");
  
  const verdictBanner = document.getElementById("verdictBanner");
  const verdictIcon = document.getElementById("verdictIcon");
  const verdictLabel = document.getElementById("verdictLabel");
  const verdictSubtitle = document.getElementById("verdictSubtitle");
  const probNumber = document.getElementById("probNumber");
  const meterFill = document.getElementById("meterFill");
  const thresholdMarker = document.getElementById("thresholdMarker");
  
  const featSentiment = document.getElementById("featSentiment");
  const featSentimentDesc = document.getElementById("featSentimentDesc");
  const featExclamation = document.getElementById("featExclamation");
  const featCaps = document.getElementById("featCaps");
  const featDiversity = document.getElementById("featDiversity");
  const triggerTags = document.getElementById("triggerTags");

  // Sample inputs
  const samplePrompts = {
    sampleFake1: "Best product ever!!! Totally changed my life. HIGHLY RECOMMEND! Use my discount code for 20% off. Five stars!",
    sampleFake2: "I got a free sample for my honest review and wow this is AMAZING!! Life changing, must buy immediately!!",
    sampleReal1: "Arrived on time and works as expected. Packaging could be better, but the item is functional.",
    sampleReal2: "The build quality is decent for the price, but the battery drains fast. After two weeks of use, it's okay."
  };

  Object.entries(samplePrompts).forEach(([id, text]) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener("click", () => {
        reviewInput.value = text;
        updateCharCount();
        runAnalysis();
      });
    }
  });

  // Char counter
  function updateCharCount() {
    charCount.textContent = reviewInput.value.length;
  }
  reviewInput.addEventListener("input", updateCharCount);

  // Slider change
  thresholdRange.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value).toFixed(2);
    thresholdValue.textContent = val;
    thresholdMarker.style.left = `${val * 100}%`;
    if (resultsContent.style.display !== "none") {
      runAnalysis();
    }
  });

  // Run analysis
  async function runAnalysis() {
    const text = reviewInput.value.trim();
    if (!text) {
      alert("Please enter or paste a review text first.");
      return;
    }

    analyzeBtn.disabled = true;
    analyzeBtn.querySelector(".btn-text").textContent = "Analyzing...";

    const threshold = parseFloat(thresholdRange.value);

    try {
      let data;
      // Try to call backend API
      try {
        const res = await fetch("/api", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, threshold })
        });
        if (res.ok) {
          data = await res.json();
        }
      } catch (err) {
        console.warn("Backend API unavailable, using client-side fallback engine", err);
      }

      // If backend API returned error or was unreached, use local client-side evaluation fallback
      if (!data || data.error) {
        data = clientSideEvaluate(text, threshold);
      }

      displayResults(data);
    } catch (e) {
      console.error(e);
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.querySelector(".btn-text").textContent = "Analyze Authenticity";
    }
  }

  function clientSideEvaluate(text, threshold) {
    const commonPhrases = ["best product ever","highly recommend","sponsored","discount for review","free sample","life changing","five stars","changed my life","discount code"];
    const words = text.split(/\s+/).filter(Boolean);
    const count = words.length;
    const exc = (text.match(/!/g) || []).length;
    const caps = words.filter(w => w.length > 3 && w === w.toUpperCase()).length;
    const phrases = commonPhrases.filter(p => text.toLowerCase().includes(p));
    
    let risk = 0.05 + (phrases.length * 0.35);
    if (exc >= 3) risk += 0.30; else if (exc >= 1) risk += 0.12 * exc;
    if (caps >= 2) risk += 0.25; else if (caps === 1) risk += 0.15;
    
    const isDescriptive = /(battery|price|packaging|weeks|keyboard|arrived|install)/i.test(text);
    if (isDescriptive) risk -= 0.35;

    const prob = Math.max(0.02, Math.min(0.99, 1 / (1 + Math.exp(-3.5 * (risk - 0.45)))));
    const uniqueRatio = words.length ? (new Set(words).size / words.length) : 1;

    return {
      label: prob >= threshold ? "FAKE" : "REAL",
      fake_probability: prob,
      threshold,
      features: {
        sentiment_score: phrases.length > 0 ? 0.75 : (isDescriptive ? 0.15 : 0.0),
        exclamation_count: exc,
        all_caps_tokens: caps,
        suspicious_phrases_detected: phrases,
        word_count: count,
        char_length: text.length,
        unique_word_ratio: Math.round(uniqueRatio * 100) / 100
      }
    };
  }

  function displayResults(data) {
    emptyState.style.display = "none";
    resultsContent.style.display = "block";

    const isFake = data.label === "FAKE";
    const probPercent = Math.round(data.fake_probability * 100);

    verdictBanner.className = `verdict-banner ${isFake ? 'fake' : 'real'}`;
    verdictIcon.textContent = isFake ? "🚨" : "🛡️";
    verdictLabel.textContent = isFake ? "FLAGGED AS FAKE / SYNTHETIC" : "LIKELY AUTHENTIC & GENUINE";
    verdictSubtitle.textContent = isFake 
      ? "High presence of hyperbolic sentiment, suspicious phrases, or promotional bias."
      : "Natural language variation and balanced sentiment indicators detected.";

    probNumber.textContent = `${probPercent}%`;
    probNumber.style.color = isFake ? "var(--danger)" : "var(--success)";
    
    meterFill.style.width = `${probPercent}%`;
    thresholdMarker.style.left = `${data.threshold * 100}%`;

    // Features
    const feat = data.features;
    featSentiment.textContent = feat.sentiment_score > 0 ? `+${feat.sentiment_score}` : feat.sentiment_score;
    featSentimentDesc.textContent = feat.sentiment_score > 0.4 ? "Highly Positive (Exaggerated)" : (feat.sentiment_score < -0.2 ? "Negative" : "Neutral / Balanced");
    
    featExclamation.textContent = feat.exclamation_count;
    featCaps.textContent = feat.all_caps_tokens;
    featDiversity.textContent = `${Math.round(feat.unique_word_ratio * 100)}%`;

    // Triggers
    if (feat.suspicious_phrases_detected && feat.suspicious_phrases_detected.length > 0) {
      triggerTags.innerHTML = feat.suspicious_phrases_detected
        .map(p => `<span class="trigger-tag">"${p}"</span>`)
        .join("");
    } else {
      triggerTags.innerHTML = `<span class="no-triggers">None detected. Natural language pattern.</span>`;
    }
  }

  analyzeBtn.addEventListener("click", runAnalysis);
});
