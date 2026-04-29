document.addEventListener('DOMContentLoaded', function() {
  // Tab elements
  const searchTab = document.getElementById('searchTab');
  const scrollTab = document.getElementById('scrollTab');
  const searchScreen = document.getElementById('searchScreen');
  const scrollScreen = document.getElementById('scrollScreen');
  
  // Search screen elements
  const indexSearchInput = document.getElementById('indexSearch');
  const searchResultsDiv = document.getElementById('searchResults');
  const searchStatusDiv = document.getElementById('searchStatus');
  const totalTweetsCount = document.getElementById('totalTweetsCount');
  const totalAccountsCount = document.getElementById('totalAccountsCount');
  const lastUpdatedDisplay = document.getElementById('lastUpdatedDisplay');
  
  // Scroll screen elements
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const jumpBottomBtn = document.getElementById('jumpBottomBtn');
  const forceLoadBtn = document.getElementById('forceLoadBtn');
  const reindexBtn = document.getElementById('reindexBtn');
  const indexNowBtn = document.getElementById('indexNowBtn');
  const searchTextInput = document.getElementById('searchText');
  const usernameTextInput = document.getElementById('usernameText');
  const embedSearchToggle = document.getElementById('embedSearchToggle');
  const statusDiv = document.getElementById('status');
  
  // Tab switching functionality
  searchTab.addEventListener('click', () => switchTab('search'));
  scrollTab.addEventListener('click', () => switchTab('scroll'));
  
  function switchTab(tabName) {
    // Update tab buttons
    searchTab.classList.toggle('active', tabName === 'search');
    scrollTab.classList.toggle('active', tabName === 'scroll');
    
    // Update screens
    searchScreen.classList.toggle('active', tabName === 'search');
    scrollScreen.classList.toggle('active', tabName === 'scroll');
    
    // Load index data when switching to search tab
    if (tabName === 'search') {
      loadIndexStats();
    }
  }
  
  // Load index stats and initialize search functionality
  loadIndexStats();
  
  // Load saved search text, username, and embed toggle
  chrome.storage.sync.get(['searchText', 'usernameText', 'embedSearchEnabled'], function(result) {
    if (result.searchText) {
      searchTextInput.value = result.searchText;
    }
    if (result.usernameText) {
      usernameTextInput.value = result.usernameText;
    }
    if (result.embedSearchEnabled !== undefined) {
      embedSearchToggle.checked = result.embedSearchEnabled;
    }
    // Update button text after loading stored values
    updateButtonText();
  });
  
  // Update button text based on search criteria
  function updateButtonText() {
    const searchText = searchTextInput.value.trim();
    const usernameText = usernameTextInput.value.trim();
    
    if (searchText || usernameText) {
      startBtn.textContent = 'Find Tweet';
    } else {
      startBtn.textContent = 'Scroll to Bottom';
    }
  }
  
  // Save search text when changed
  searchTextInput.addEventListener('input', function() {
    chrome.storage.sync.set({
      searchText: searchTextInput.value
    });
    updateButtonText();
  });
  
  // Save username when changed
  usernameTextInput.addEventListener('input', function() {
    chrome.storage.sync.set({
      usernameText: usernameTextInput.value
    });
    updateButtonText();
  });
  
  // Save embed search toggle when changed
  embedSearchToggle.addEventListener('change', function() {
    chrome.storage.sync.set({
      embedSearchEnabled: embedSearchToggle.checked
    });
    
    // Send message to content script to toggle embed search
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0] && tabs[0].url.includes('x.com') && tabs[0].url.includes('/likes')) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'toggleEmbedSearch',
          enabled: embedSearchToggle.checked
        });
      }
    });
  });
  
  // Index search functionality for popup
  indexSearchInput.addEventListener('input', function() {
    const query = indexSearchInput.value.trim();
    if (query) {
      performIndexSearch(query);
    } else {
      hideSearchResults();
    }
  });
  
  // Load and display index statistics
  function loadIndexStats() {
    // Get all possible user indices
    chrome.storage.local.get(null, function(items) {
      const tweetIndices = [];
      let totalTweets = 0;
      let uniqueAccounts = new Set();
      let latestUpdate = null;
      
      // Find all Robin tweet indices
      Object.keys(items).forEach(key => {
        if (key.startsWith('robinTweetIndex_')) {
          const index = items[key];
          if (index && index.tweets) {
            tweetIndices.push(index);
            totalTweets += index.tweets.length;
            
            // Count unique accounts
            index.tweets.forEach(([id, tweet]) => {
              if (tweet.username) uniqueAccounts.add(tweet.username);
              if (tweet.originalAuthor) uniqueAccounts.add(tweet.originalAuthor);
            });
            
            // Track latest update
            if (index.lastUpdated) {
              const updateDate = new Date(index.lastUpdated);
              if (!latestUpdate || updateDate > latestUpdate) {
                latestUpdate = updateDate;
              }
            }
          }
        }
      });
      
      // Update UI
      totalTweetsCount.textContent = totalTweets.toLocaleString();
      totalAccountsCount.textContent = uniqueAccounts.size.toLocaleString();
      
      if (latestUpdate) {
        lastUpdatedDisplay.textContent = `Last updated: ${latestUpdate.toLocaleDateString()} at ${latestUpdate.toLocaleTimeString()}`;
      } else if (totalTweets === 0) {
        lastUpdatedDisplay.textContent = 'No tweets indexed yet. Visit a Twitter likes page to start indexing.';
      } else {
        lastUpdatedDisplay.textContent = 'Index loaded';
      }
      
      // Show helpful message if no tweets
      if (totalTweets === 0) {
        searchStatusDiv.innerHTML = `
          <div style="text-align: center; padding: 20px;">
            <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
            <div style="font-weight: 600; margin-bottom: 8px;">No tweets indexed yet</div>
            <div style="font-size: 12px; line-height: 1.4; color: #657786;">
              Visit a Twitter/X likes page and use the Scroll tab to index your liked tweets, 
              then you can search them here even when offline.
            </div>
          </div>
        `;
        searchStatusDiv.style.display = 'block';
      } else {
        searchStatusDiv.innerHTML = `
          <div style="text-align: center; padding: 20px;">
            <div style="font-size: 32px; margin-bottom: 12px;">🔍</div>
            <div>Start typing to search your ${totalTweets.toLocaleString()} indexed tweets</div>
          </div>
        `;
        searchStatusDiv.style.display = 'block';
      }
    });
  }
  
  // Perform search across all indices
  function performIndexSearch(query) {
    chrome.storage.local.get(null, function(items) {
      const allResults = [];
      
      // Search across all Robin tweet indices
      Object.keys(items).forEach(key => {
        if (key.startsWith('robinTweetIndex_')) {
          const index = items[key];
          if (index && index.tweets) {
            const results = searchTweetsInIndex(index.tweets, query);
            allResults.push(...results);
          }
        }
      });
      
      // Sort by timestamp (newest first)
      allResults.sort((a, b) => {
        const dateA = new Date(a.timestamp || 0);
        const dateB = new Date(b.timestamp || 0);
        return dateB - dateA;
      });
      
      displayIndexSearchResults(allResults, query);
    });
  }
  
  // Search function similar to content script
  function searchTweetsInIndex(tweetsArray, query) {
    const filters = parseSearchQuery(query);
    const results = [];
    
    tweetsArray.forEach(([id, tweet]) => {
      let matches = true;
      
      // Text search
      if (filters.text.length > 0) {
        const textMatch = filters.text.every(term => 
          tweet.textLower && tweet.textLower.includes(term)
        );
        if (!textMatch) matches = false;
      }
      
      // Username search
      if (filters.from.length > 0) {
        const usernameMatch = filters.from.some(username => 
          (tweet.username && tweet.username.includes(username.replace('@', ''))) ||
          (tweet.originalAuthor && tweet.originalAuthor.includes(username.replace('@', '')))
        );
        if (!usernameMatch) matches = false;
      }
      
      // Media filters
      if (filters.has.length > 0) {
        const hasMatch = filters.has.every(hasType => {
          switch (hasType) {
            case 'video': return tweet.hasVideo;
            case 'image': return tweet.hasImage;
            case 'link': case 'url': return tweet.hasURL;
            default: return false;
          }
        });
        if (!hasMatch) matches = false;
      }
      
      if (matches) {
        results.push({ ...tweet, id });
      }
    });
    
    return results;
  }
  
  // Parse search query (same as content script)
  function parseSearchQuery(query) {
    const filters = {
      text: [],
      from: [],
      has: []
    };
    
    const terms = query.toLowerCase().match(/(\S+:"[^"]*"|\S+)/g) || [];
    
    terms.forEach(term => {
      if (term.startsWith('from:')) {
        filters.from.push(term.replace('from:', '').replace(/"/g, ''));
      } else if (term.startsWith('has:')) {
        filters.has.push(term.replace('has:', '').replace(/"/g, ''));
      } else {
        filters.text.push(term.replace(/"/g, ''));
      }
    });
    
    return filters;
  }
  
  // Display search results in popup
  function displayIndexSearchResults(results, query) {
    hideSearchStatus();
    
    if (results.length === 0) {
      searchResultsDiv.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: #657786;">
          <div style="font-size: 32px; margin-bottom: 12px;">🔍</div>
          <div style="font-weight: 600; margin-bottom: 8px;">No results found</div>
          <div style="font-size: 12px;">Try a different search term or check your spelling</div>
        </div>
      `;
    } else {
      const maxResults = 20;
      const displayedResults = results.slice(0, maxResults);
      
      const resultsHtml = displayedResults.map(tweet => {
        const truncatedText = tweet.text && tweet.text.length > 120 ? 
          tweet.text.substring(0, 120) + '...' : (tweet.text || '');
        
        const authorDisplay = tweet.displayName ? 
          `${tweet.displayName} (@${tweet.originalAuthor || tweet.username})` : 
          `@${tweet.username || 'unknown'}`;
        
        const mediaIcons = [];
        if (tweet.hasVideo) mediaIcons.push('📹');
        if (tweet.hasImage) mediaIcons.push('🖼️');
        if (tweet.hasURL) mediaIcons.push('🔗');
        
        return `
          <div class="search-result-item" data-tweet-url="${tweet.url || ''}">
            <div class="search-result-author">${authorDisplay}</div>
            <div class="search-result-text">${truncatedText}</div>
            <div class="search-result-meta">
              <span>${tweet.timestamp ? new Date(tweet.timestamp).toLocaleDateString() : ''}</span>
              <div class="media-icons">
                <span>❤️ ${tweet.metrics?.likes || 0}</span>
                <span>🔄 ${tweet.metrics?.retweets || 0}</span>
                ${mediaIcons.join(' ')}
              </div>
            </div>
          </div>
        `;
      }).join('');
      
      const headerHtml = results.length > maxResults ? 
        `<div style="text-align: center; padding: 12px; background: #f8f9fa; border-radius: 8px; margin-bottom: 12px; font-size: 13px; color: #657786;">
          Showing ${maxResults} of ${results.length} results
        </div>` : '';
      
      searchResultsDiv.innerHTML = headerHtml + resultsHtml;
      
      // Add click listeners
      const resultItems = searchResultsDiv.querySelectorAll('.search-result-item');
      resultItems.forEach(item => {
        item.addEventListener('click', function() {
          const url = item.getAttribute('data-tweet-url');
          if (url) {
            chrome.tabs.create({ url: url });
          }
        });
      });
    }
    
    searchResultsDiv.style.display = 'block';
  }
  
  function hideSearchResults() {
    searchResultsDiv.style.display = 'none';
    searchStatusDiv.style.display = 'block';
  }
  
  function hideSearchStatus() {
    searchStatusDiv.style.display = 'none';
  }
  
  // Update button text on initial load
  updateButtonText();
  
  // Check if scrolling is already active
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {action: 'getStatus'}, function(response) {
      if (chrome.runtime.lastError) {
        statusDiv.textContent = 'Please navigate to Twitter/X likes page';
        return;
      }
      
      if (response && response.isScrolling) {
        showStopButton();
        statusDiv.textContent = 'Scrolling in progress...';
      }
    });
  });
  
  startBtn.addEventListener('click', function() {
    const searchText = searchTextInput.value.trim();
    const usernameText = usernameTextInput.value.trim();
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
      
      // Check if we're on Twitter/X
      if (!tab.url.includes('twitter.com') && !tab.url.includes('x.com')) {
        statusDiv.textContent = 'Please navigate to Twitter/X first';
        return;
      }
      
      // Send message to content script
      chrome.tabs.sendMessage(tab.id, {
        action: 'startScroll',
        searchText: searchText,
        username: usernameText
      }, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: Please refresh the page';
          return;
        }
        
        showStopButton();
        const searchInfo = [];
        if (searchText) searchInfo.push(`text: "${searchText}"`);
        if (usernameText) searchInfo.push(`user: ${usernameText}`);
        
        statusDiv.textContent = searchInfo.length > 0 
          ? `Ultra-fast scrolling... (${searchInfo.join(', ')})`
          : 'Ultra-fast scrolling started...';
      });
    });
  });
  
  stopBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'stopScroll'}, function(response) {
        showStartButton();
        statusDiv.textContent = 'Scrolling stopped';
      });
    });
  });
  
  jumpBottomBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
      
      if (!tab.url.includes('twitter.com') && !tab.url.includes('x.com')) {
        statusDiv.textContent = 'Please navigate to Twitter/X first';
        return;
      }
      
      chrome.tabs.sendMessage(tab.id, {action: 'jumpToBottom'}, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: Please refresh the page';
          return;
        }
        statusDiv.textContent = 'Jumping to bottom...';
      });
    });
  });
  
  forceLoadBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
      
      if (!tab.url.includes('twitter.com') && !tab.url.includes('x.com')) {
        statusDiv.textContent = 'Please navigate to Twitter/X first';
        return;
      }
      
      chrome.tabs.sendMessage(tab.id, {action: 'forceLoad'}, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: Please refresh the page';
          return;
        }
        statusDiv.textContent = 'Forcing content load...';
      });
    });
  });
  
  indexNowBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
      
      if (!tab.url.includes('x.com') || !tab.url.includes('/likes')) {
        statusDiv.textContent = 'Please navigate to a X.com likes page first';
        return;
      }
      
      chrome.tabs.sendMessage(tab.id, {action: 'indexNewTweets'}, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: Please refresh the page';
          return;
        }
        statusDiv.textContent = 'Indexing new tweets...';
        // Refresh the index stats in the search tab
        setTimeout(() => {
          loadIndexStats();
        }, 1000);
      });
    });
  });

  reindexBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
      
      if (!tab.url.includes('x.com') || !tab.url.includes('/likes')) {
        statusDiv.textContent = 'Please navigate to a X.com likes page first';
        return;
      }
      
      if (confirm('Are you sure you want to reindex all tweets? This will delete the current index and rebuild it from scratch. This may take several minutes.')) {
        chrome.tabs.sendMessage(tab.id, {action: 'reindexAll'}, function(response) {
          if (chrome.runtime.lastError) {
            statusDiv.textContent = 'Error: Please refresh the page';
            return;
          }
          statusDiv.textContent = 'Starting reindex...';
        });
      }
    });
  });
  
  
  function showStartButton() {
    startBtn.style.display = 'block';
    stopBtn.style.display = 'none';
  }
  
  function showStopButton() {
    startBtn.style.display = 'none';
    stopBtn.style.display = 'block';
  }
  
  // Listen for messages from content script
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'scrollComplete') {
      showStartButton();
      statusDiv.textContent = request.reason || 'Scrolling completed';
    } else if (request.action === 'scrollProgress') {
      statusDiv.textContent = `Scrolling... ${request.progress}`;
    }
  });
  
});