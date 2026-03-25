// Global Notification Socket for Online/Offline Status
const notificationSocket = new WebSocket(
  "ws://" + window.location.host + "/ws/notifications/",
);

notificationSocket.onmessage = function (e) {
  const data = JSON.parse(e.data);

  if (data.type === "sync_online_users") {
    // Initial sync on load: Turn everyone in the active list green
    data.online_users.forEach((username) => {
      updateUserStatus(username, "online");
    });
  } else if (data.type === "user_status") {
    // Real-time update when someone logs in or out
    updateUserStatus(data.username, data.status);
  }
};

function updateUserStatus(username, status) {
  // 1. The small dots in the left sidebar
  const statusDots = document.querySelectorAll(
    `.status-dot[data-username="${username}"]`,
  );

  statusDots.forEach((dot) => {
    if (status === "online") {
      dot.classList.remove("offline");
      dot.classList.add("online");
    } else {
      dot.classList.remove("online");
      dot.classList.add("offline");
    }
  });

  // 2. The new modern pills in the Header and Right Sidebar
  const statusPills = document.querySelectorAll(
    `.profile-status-text[data-username="${username}"]`,
  );

  statusPills.forEach((pill) => {
    if (status === "online") {
      pill.className = "status-pill online-pill profile-status-text";
      pill.innerHTML = '<span class="pulse-dot"></span> Online';
    } else {
      pill.className = "status-pill offline-pill profile-status-text";
      pill.innerHTML = '<span class="offline-dot"></span> Offline';
    }
  });
}
// End Global Notification Socket

// Only connect to WebSocket if a room is actually selected
if (window.currentRoomName) {
  const roomName = window.currentRoomName;
  const chatSocket = new WebSocket(
    "ws://" + window.location.host + "/ws/chat/" + roomName + "/",
  );

  const typingIndicator = document.querySelector("#typing-indicator");
  const chatLog = document.querySelector("#chat-log");

  // Scroll to bottom on load
  if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;

  chatSocket.onmessage = function (e) {
    const data = JSON.parse(e.data);

    console.log("WS:", data, "ME:", window.currentUser);

    // USER LIST (for sidebar / debug)
    if (data.users) {
      console.log("Active users:", data.users);
      return;
    }

    // TYPING
    if (data.typing === true) {
      if (data.username === window.currentUser) return;
      typingIndicator.innerHTML = `
        <div class="typing-bubble">
            <span>${data.username}</span>
            <div class="typing-dots">
                <i></i><i></i><i></i>
            </div>
        </div>
      `;

      // Wait 100ms for the HTML to render, then pull the specific element into view smoothly
      setTimeout(() => {
        if (typingIndicator) {
          typingIndicator.scrollIntoView({ behavior: "smooth", block: "end" });
        }
      }, 100);

      return;
    }

    if (data.typing === false) {
      typingIndicator.innerHTML = "";
      return;
    }

    typingIndicator.innerText = "";

    // MESSAGE
    if (data.message) {
      // IGNORE OWN MESSAGE
      if (data.username === window.currentUser) {
        console.log("Ignored own message");
        return;
      }

      const messageWrapper = document.createElement("div");
      messageWrapper.classList.add("message-wrapper", "received");

      const isChannel = window.currentRoomIsGroup;
      const contentHtml = data.image_url
        ? `<img src="${data.image_url}" style="max-width:200px; border-radius:10px; margin-bottom:5px;"><br>${data.message}`
        : data.message;

      const now = new Date();
      const timeStr =
        now.getHours().toString().padStart(2, "0") +
        ":" +
        now.getMinutes().toString().padStart(2, "0");

      messageWrapper.innerHTML = `
    ${
      isChannel
        ? `
        <div class="avatar-circle" style="width:32px; height:32px; font-size:13px; margin-right:8px; align-self:flex-end;">
            ${data.username.charAt(0).toUpperCase()}
        </div>`
        : ""
    }
    <div>
        ${isChannel ? `<span class="sender-name">${data.username}</span>` : ""}
        <div class="message-bubble">
            ${contentHtml}
        </div>
        <span class="timestamp">${timeStr}</span>
    </div>
`;

      chatLog.appendChild(messageWrapper);
      chatLog.scrollTop = chatLog.scrollHeight;
    }
  };

  document.querySelector("#chat-message-submit").onclick = function () {
    const messageInput = document.querySelector("#chat-message-input");
    const message = messageInput.value.trim();

    if (message.length > 0) {
      // Send to backend
      chatSocket.send(
        JSON.stringify({
          message: message,
        }),
      );

      // Show immediately (sent bubble)
      const messageWrapper = document.createElement("div");
      messageWrapper.classList.add("message-wrapper", "sent");

      const now = new Date();
      const timeStr =
        now.getHours().toString().padStart(2, "0") +
        ":" +
        now.getMinutes().toString().padStart(2, "0");

      messageWrapper.innerHTML = `
    <div>
        <div class="message-bubble">
            ${message}
        </div>
        <span class="timestamp">${timeStr}</span>
    </div>
`;

      chatLog.appendChild(messageWrapper);
      chatLog.scrollTop = chatLog.scrollHeight;

      messageInput.value = "";

      chatSocket.send(JSON.stringify({ typing: false }));
    }
  };

  const messageInput = document.querySelector("#chat-message-input");

  // Typing indicator logic
  messageInput.addEventListener("input", function () {
    if (messageInput.value.length > 0) {
      chatSocket.send(JSON.stringify({ typing: true }));
    } else {
      chatSocket.send(JSON.stringify({ typing: false }));
    }
  });

  // Send on 'Enter' key
  messageInput.addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
      document.querySelector("#chat-message-submit").click();
    }
  });

  // Image Upload Logic
  const attachBtn = document.querySelector("#attach-btn");
  const imageInput = document.querySelector("#image-input");

  // Clicking the paperclip opens the file browser
  if (attachBtn) attachBtn.onclick = () => imageInput.click();

  if (imageInput) {
    imageInput.addEventListener("change", function () {
      const file = this.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("image", file);
      formData.append("room_id", window.currentRoomName);

      // Get CSRF Token
      const csrftoken = document.cookie
        .split("; ")
        .find((row) => row.startsWith("csrftoken="))
        ?.split("=")[1];

      // 1. Upload via HTTP Fetch
      fetch("/api/upload-image/", {
        method: "POST",
        headers: { "X-CSRFToken": csrftoken },
        body: formData,
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.status === "success") {
            // 2. Broadcast the image URL via WebSocket
            chatSocket.send(
              JSON.stringify({
                message: "🖼️ Image uploaded",
                image_url: data.image_url,
              }),
            );

            // 3. Show immediately for sender
            const messageWrapper = document.createElement("div");
            messageWrapper.classList.add("message-wrapper", "sent");
            messageWrapper.innerHTML = `
            <div class="message-bubble">
                <img src="${data.image_url}" style="max-width:200px; border-radius:10px; display:block;">
                <span style="font-size:11px; opacity:0.8; margin-top:4px; display:block;">📎 Image</span>
            </div>
        `;
            chatLog.appendChild(messageWrapper);
            chatLog.scrollTop = chatLog.scrollHeight;
          }
        });
    });
  }
}

// Chat Modal Logic
const addBtn = document.querySelector(".add-btn");
const modal = document.querySelector("#new-chat-modal");
const closeModal = document.querySelector(".close-modal");

const btnPrivate = document.querySelector("#btn-private");
const btnChannel = document.querySelector("#btn-channel");
const formPrivate = document.querySelector("#form-private");
const formChannel = document.querySelector("#form-channel");
const submitNewChat = document.querySelector("#submit-new-chat");

// Open/Close Modal
if (addBtn) addBtn.onclick = () => (modal.style.display = "flex");
if (closeModal) closeModal.onclick = () => (modal.style.display = "none");

// Toggle Chat Type
let currentChatType = "channel";

btnPrivate.onclick = () => {
  currentChatType = "private";
  btnPrivate.classList.add("active");
  btnChannel.classList.remove("active");
  formPrivate.style.display = "block";
  formChannel.style.display = "none";
};

btnChannel.onclick = () => {
  currentChatType = "channel";
  btnChannel.classList.add("active");
  btnPrivate.classList.remove("active");
  formChannel.style.display = "block";
  formPrivate.style.display = "none";
};

// Submit New Chat
submitNewChat.onclick = () => {
  const payload = { type: currentChatType };

  if (currentChatType === "private") {
    payload.username = document.querySelector(
      ".chat-list-item.selected",
    )?.dataset.username;
  } else {
    payload.channel_name = document.querySelector("#channel-name").value.trim();
    if (!payload.channel_name) return alert("Please enter a channel name.");
  }

  // Get CSRF Token from cookies
  const csrftoken = document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrftoken="))
    ?.split("=")[1];

  fetch("/api/create-chat/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrftoken,
    },
    body: JSON.stringify(payload),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.status === "success") {
        // Redirect to the newly created chat
        window.location.href = "/chat/" + data.room_id + "/";
      } else {
        alert(data.message);
      }
    });
};

// Search Bar Filtering
const searchBar = document.querySelector(".search-bar");

if (searchBar) {
  searchBar.addEventListener("input", function (e) {
    // Get the search term and convert to lowercase for case-insensitive matching
    const searchTerm = e.target.value.toLowerCase();

    // Grab every chat item in the list
    const chatItems = document.querySelectorAll(".chat-list-item");

    chatItems.forEach((item) => {
      // Find the h4 tag inside the item (which holds the username or channel name)
      const name = item.querySelector("h4").innerText.toLowerCase();

      // If the name includes what we typed, show it. Otherwise, hide it.
      if (name.includes(searchTerm)) {
        item.style.display = "flex";
      } else {
        item.style.display = "none";
      }
    });
  });
}

// Direct Message Trigger
function startWhatsAppChat(targetUsername) {
  const csrftoken = document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrftoken="))
    ?.split("=")[1];

  fetch("/api/create-chat/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
    body: JSON.stringify({ type: "private", username: targetUsername }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.status === "success")
        window.location.href = "/chat/" + data.room_id + "/";
    });
}

// Sidebar Tab Switching
const navItems = document.querySelectorAll(".nav-icons li[data-tab]");
const channelsSection = document.querySelector('[data-section="channels"]');
const dmsSection = document.querySelector('[data-section="dms"]');

navItems.forEach((tab) => {
  tab.addEventListener("click", function () {
    // Update active highlight
    navItems.forEach((t) => t.classList.remove("active"));
    this.classList.add("active");

    const tabName = this.dataset.tab;

    if (tabName === "home") {
      if (channelsSection) channelsSection.style.display = "block";
      if (dmsSection) dmsSection.style.display = "block";
    } else if (tabName === "dms") {
      if (channelsSection) channelsSection.style.display = "none";
      if (dmsSection) dmsSection.style.display = "block";
    } else if (tabName === "channels") {
      if (channelsSection) channelsSection.style.display = "block";
      if (dmsSection) dmsSection.style.display = "none";
    } else if (tabName === "media") {
      if (channelsSection) channelsSection.style.display = "none";
      if (dmsSection) dmsSection.style.display = "none";
      // Media tab — future feature
    } else if (tabName === "notifications") {
      if (channelsSection) channelsSection.style.display = "none";
      if (dmsSection) dmsSection.style.display = "none";
      // Notifications tab — future feature
    }
  });
});

// Settings Panel
const settingsBtn = document.querySelector("#settings-btn");
const settingsPanel = document.querySelector("#settings-panel");
const settingsClose = document.querySelector("#settings-close");

if (settingsBtn && settingsPanel) {
  settingsBtn.addEventListener("click", function () {
    settingsPanel.classList.toggle("open");
  });
}

if (settingsClose && settingsPanel) {
  settingsClose.addEventListener("click", function () {
    settingsPanel.classList.remove("open");
  });
}

// Interactive Emoji Menu
const emojiToggleBtn = document.querySelector("#emoji-toggle-btn");
const emojiMenu = document.querySelector("#emoji-menu");
const chatInputBox = document.querySelector("#chat-message-input");

if (emojiToggleBtn && emojiMenu) {
  // 1. Toggle menu when smiley icon is clicked
  emojiToggleBtn.addEventListener("click", function () {
    emojiMenu.classList.toggle("show");
  });

  // 2. Add clicked emoji into the input box
  document.querySelectorAll(".emoji-click").forEach((emoji) => {
    emoji.addEventListener("click", function () {
      chatInputBox.value += this.innerText;
      chatInputBox.focus(); // Keep cursor in the box
    });
  });
}
