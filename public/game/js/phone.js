(function () {
  "use strict";

  class PhoneSystem {
    constructor(listElement) {
      this.listElement = listElement;
      this.messages = [];
      this.reset();
    }

    reset() {
      this.messages = [{ sender: "值班系统", text: "终端已连接。00:00—06:00，请观察监控并及时上报。", system: true }];
      this.render();
    }

    addMessage(message) {
      this.messages.push(message);
      if (this.messages.length > 18) this.messages.shift();
      this.render();
    }

    render() {
      if (!this.listElement) return;
      this.listElement.textContent = "";
      this.messages.forEach((message) => {
        const item = document.createElement("article");
        // suspicious remains story metadata only. It must not become a visual
        // class that lets the player identify false or unreliable messages.
        item.className = `chat-message${message.corrupt ? " corrupt" : ""}${message.system ? " system" : ""}`;
        const sender = document.createElement("strong");
        sender.textContent = message.sender || "未知号码";
        const text = document.createElement("p");
        text.textContent = message.text;
        item.append(sender, text);
        this.listElement.append(item);
      });
      this.listElement.scrollTop = this.listElement.scrollHeight;
    }
  }

  window.PhoneSystem = PhoneSystem;
})();
