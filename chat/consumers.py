import json
from channels.generic.websocket import WebsocketConsumer
from asgiref.sync import async_to_sync
from .models import Message, Conversation
from django.contrib.auth.models import User

active_users = {}

class ChatConsumer(WebsocketConsumer):

    def connect(self):
        # 1. Reject unauthenticated users immediately
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            self.close()
            return

        self.room_name = self.scope["url_route"]["kwargs"]["room_name"]
        self.room_group_name = "chat_%s" % self.room_name

        async_to_sync(self.channel_layer.group_add)(
            self.room_group_name,
            self.channel_name
        )
        self.accept()

        # 2. Add securely authenticated user to active list
        if self.room_name not in active_users:
            active_users[self.room_name] = []
        
        if self.user.username not in active_users[self.room_name]:
            active_users[self.room_name].append(self.user.username)

        async_to_sync(self.channel_layer.group_send)(
            self.room_group_name,
            {
                "type": "user_list",
                "users": active_users[self.room_name]
            }
        )

    def disconnect(self, close_code):
        # Remove user from active list on disconnect
        if hasattr(self, 'user') and self.user.is_authenticated:
            if self.room_name in active_users and self.user.username in active_users[self.room_name]:
                active_users[self.room_name].remove(self.user.username)
                
                async_to_sync(self.channel_layer.group_send)(
                    self.room_group_name,
                    {
                        "type": "user_list",
                        "users": active_users[self.room_name]
                    }
                )

        async_to_sync(self.channel_layer.group_discard)(
            self.room_group_name,
            self.channel_name
        )

    def receive(self, text_data):
        data = json.loads(text_data)

        message = data.get("message")
        typing = data.get("typing")

        sender = self.scope["user"]

        # ✅ HANDLE TYPING START
        if typing is True:
            async_to_sync(self.channel_layer.group_send)(
                self.room_group_name,
                {
                    "type": "typing_status",
                    "username": sender.username,
                    "sender_channel": self.channel_name
                }
            )
            return
        
        # ✅ HANDLE TYPING STOP
        if typing is False:
            async_to_sync(self.channel_layer.group_send)(
                self.room_group_name,
                {
                    "type": "stop_typing"
                }
            )
            return
        
        # ✅ NORMAL MESSAGE
        if message:
            if not data.get("image_url"):
                Message.objects.create(
                    conversation_id=int(self.room_name),
                    sender=sender,
                    content=message
                )

            async_to_sync(self.channel_layer.group_send)(
                self.room_group_name,
                {
                    "type": "chat_message",
                    "message": message,
                    "username": sender.username,
                    "image_url": data.get("image_url", "")
                }
            )

    def chat_message(self, event):
        self.send(text_data=json.dumps({
            "message": event["message"],
            "username": event["username"],
            "image_url": event.get("image_url", "")
        }))

    def typing_status(self, event):
        if self.channel_name == event.get("sender_channel"):
            return
        self.send(text_data=json.dumps({
            "typing": True,
            "username": event["username"]
        }))

    def stop_typing(self, event):
        self.send(text_data=json.dumps({"typing": False}))

    def user_list(self, event):
        self.send(text_data=json.dumps({"users": event["users"]}))

# Add this below your existing ChatConsumer in consumers.py

global_online_users = set()

class NotificationConsumer(WebsocketConsumer):
    def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            self.close()
            return

        self.group_name = "global_notifications"
        async_to_sync(self.channel_layer.group_add)(
            self.group_name,
            self.channel_name
        )
        self.accept()

        # Add user to online set
        global_online_users.add(self.user.username)
        
        # Broadcast to everyone else that this user just came online
        async_to_sync(self.channel_layer.group_send)(
            self.group_name,
            {
                "type": "user_status",
                "username": self.user.username,
                "status": "online"
            }
        )
        
        # Send the newly connected user a full list of who is currently online
        self.send(text_data=json.dumps({
            "type": "sync_online_users",
            "online_users": list(global_online_users)
        }))

    def disconnect(self, close_code):
        if hasattr(self, 'user') and self.user.is_authenticated:
            if self.user.username in global_online_users:
                global_online_users.remove(self.user.username)
            
            # Broadcast that the user went offline
            async_to_sync(self.channel_layer.group_send)(
                self.group_name,
                {
                    "type": "user_status",
                    "username": self.user.username,
                    "status": "offline"
                }
            )

        async_to_sync(self.channel_layer.group_discard)(
            self.group_name,
            self.channel_name
        )

    def user_status(self, event):
        self.send(text_data=json.dumps({
            "type": "user_status",
            "username": event["username"],
            "status": event["status"]
        }))
        