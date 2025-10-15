// D:\chrome-extension\popup.js
import { API_URL } from './config.js';

document.addEventListener('DOMContentLoaded', async () => {
  const urlDiv = document.getElementById('url');
  const responseDiv = document.getElementById('response');
  const reverifyButton = document.getElementById('reverify');
  const copyButton = document.getElementById('copy-response');

  // Function to validate if URL is a YouTube or Instagram video
  function isVideoUrl(url) {
    return (
      /youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/|youtube\.com\/live\//.test(url) ||
      /instagram\.com\/(?:p|reel)\//.test(url)
    );
  }

  // Function to format response for display
  function formatResponse(data) {
    if (data.error) {
      return `<span class="error">Error: ${data.error}</span>`;
    }
    const { message, data: { platform, isFinancial, isMisleading, factCheck, normalizedTranscript } } = data;
    let output = `<div class="message"><strong>Message:</strong> ${message}</div>`;
    output += `<div class="platform"><strong>Platform:</strong> ${platform}</div>`;
    output += `<div class="financial"><strong>Financial Content:</strong> ${isFinancial ? 'Yes' : 'No'}</div>`;

    // For non-financial videos, only show "No" for financial content
    if (!isFinancial) {
      return output;
    }

    // For financial videos, include additional details
    output += `<div class="misleading"><strong>Misleading:</strong> ${isMisleading ? 'Yes' : 'No'}</div>`;
    if (normalizedTranscript) {
      output += `<div class="transcript"><strong>Transcript:</strong> ${normalizedTranscript.substring(0, 200)}${normalizedTranscript.length > 200 ? '...' : ''}</div>`;
    }
    if (factCheck.claims.length > 0) {
      output += `<div class="claims"><strong>Claims:</strong></div>`;
      factCheck.claims.forEach((claim, index) => {
        output += `<div class="claims">- Claim ${index + 1}: ${claim.claim}</div>`;
        output += `<div class="claims">  Accurate: ${claim.isAccurate ? 'Yes' : 'No'}</div>`;
        output += `<div class="claims">  Explanation: ${claim.explanation.substring(0, 150)}${claim.explanation.length > 150 ? '...' : ''}</div>`;
      });
    }
    if (factCheck.sources && factCheck.sources.length > 0) {
      output += `<div class="sources"><strong>Sources:</strong></div>`;
      factCheck.sources.forEach((source, index) => {
        output += `<div class="sources">- ${index + 1}: <a href="${source.url}" target="_blank">${source.title}</a></div>`;
      });
    }
    return output;
  }

  // Function to send verification request
  async function verifyVideo(url) {
    responseDiv.classList.add('loading');
    responseDiv.innerHTML = `
      <div class="skeleton-loader">
        <div class="skeleton-line long"></div>
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line short"></div>
        <div class="skeleton-line long"></div>
      </div>`;
    reverifyButton.disabled = true;

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoURL: url,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      responseDiv.innerHTML = formatResponse(data);
    } catch (error) {
      let userMessage = 'An error occurred while verifying the video.';
      if (error.message.includes('Invalid video URL')) {
        userMessage = 'The video URL is invalid. Please check the URL.';
      } else if (error.message.includes('Unsupported platform')) {
        userMessage = 'Only YouTube and Instagram videos are supported.';
      } else if (error.message.includes('Transcript not found')) {
        userMessage = 'No transcript available for this video.';
      } else if (error.message.includes('Could not extract')) {
        userMessage = 'Unable to process this video URL. Ensure it’s a valid video.';
      }
      responseDiv.innerHTML = `<span class="error">${userMessage}</span>`;
    } finally {
      responseDiv.classList.remove('loading');
      reverifyButton.disabled = false;
    }
  }

  // Function to copy response to clipboard
  function copyToClipboard() {
    const text = responseDiv.innerText;
    navigator.clipboard.writeText(text).then(() => {
      copyButton.textContent = 'Copied!';
      copyButton.classList.add('success');
      setTimeout(() => {
        copyButton.textContent = 'Copy Response';
        copyButton.classList.remove('success');
      }, 2000);
    }).catch(() => {
      copyButton.textContent = 'Copy Failed';
      copyButton.classList.add('error');
      setTimeout(() => {
        copyButton.textContent = 'Copy Response';
        copyButton.classList.remove('error');
      }, 2000);
    });
  }

  // Get the current tab's URL and verify if it's a video
  async function checkAndVerify() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentUrl = tab.url || 'No URL found';
      urlDiv.textContent = `Current URL: ${currentUrl}`;

      if (!isVideoUrl(currentUrl)) {
        responseDiv.innerHTML = '<span class="error">Please open a YouTube or Instagram video page.</span>';
        reverifyButton.disabled = true;
        return;
      }

      reverifyButton.disabled = false;
      await verifyVideo(currentUrl);
    } catch (error) {
      urlDiv.innerHTML = `<span class="error">Error getting URL: ${error.message}</span>`;
      responseDiv.innerHTML = '<span class="error">Unable to load the video URL.</span>';
      reverifyButton.disabled = true;
    }
  }

  // Initial verification
  await checkAndVerify();

  // Event listener for re-verify button
  reverifyButton.addEventListener('click', checkAndVerify);

  // Event listener for copy button
  copyButton.addEventListener('click', copyToClipboard);
});