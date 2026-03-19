from django.shortcuts import render, get_object_or_404, redirect
from .models import Message, Conversation
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from django.contrib.auth import login, logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.http import JsonResponse
import json

@login_required
def room(request, room_name):
    conversation = get_object_or_404(Conversation, id=room_name)
    
    if request.user not in conversation.users.all():
        if conversation.is_group:
            conversation.users.add(request.user)  # auto-join channel
        else:
            return redirect("/")  # block private chat access

    messages = conversation.messages.order_by("timestamp")
    conversations = Conversation.objects.filter(users=request.user)
    other_user = conversation.users.exclude(id=request.user.id).first()
    # Grab all users except the person logged in
    all_users = User.objects.exclude(id=request.user.id)

    # --- Fetch media for the gallery ---
    # Get all messages in this chat that have an image, ordered by newest first
    media_messages = messages.exclude(image__exact='').exclude(image__isnull=True).order_by("-timestamp")
    
    # Count total media files
    media_count = media_messages.count()
    
    # Grab just the latest 3 or 4 to show as thumbnails
    recent_media = media_messages[:3] 

    all_channels = Conversation.objects.filter(is_group=True)
    user_channel_ids = list(
        Conversation.objects.filter(users=request.user, is_group=True).values_list('id', flat=True)
    )
    return render(request, "chat/app.html", {
        "room_name": room_name,
        "messages": messages,
        "conversations": conversations,
        "conversation": conversation,
        "other_user": other_user,
        "active_conversation_id": int(room_name),
        "media_count": media_count,
        "recent_media": recent_media,
        "all_users": all_users,
        "all_channels": all_channels,
        "user_channel_ids": user_channel_ids
    })

def register_view(request):
    form = UserCreationForm(request.POST or None)
    if form.is_valid():
        user = form.save()
        login(request, user)
        return redirect("/")
    return render(request, "chat/register.html", {"form": form})

def login_view(request):
    form = AuthenticationForm(request, data=request.POST or None)
    if form.is_valid():
        login(request, form.get_user())
        return redirect("/")
    return render(request, "chat/login.html", {"form": form})

def logout_view(request):
    logout(request)
    return redirect("/login/")

@login_required
def app_view(request):
    conversations = Conversation.objects.filter(users=request.user)
    all_channels = Conversation.objects.filter(is_group=True)
    all_users = User.objects.exclude(id=request.user.id)
    user_channel_ids = list(
        Conversation.objects.filter(users=request.user, is_group=True).values_list('id', flat=True)
    )
    return render(request, "chat/app.html", {
        "conversations": conversations,
        "all_channels": all_channels,
        "all_users": all_users,
        "user_channel_ids": user_channel_ids
    })

@login_required
def create_chat_api(request):
    if request.method == "POST":
        data = json.loads(request.body)
        chat_type = data.get("type")

        if chat_type == "private":
            target_username = data.get("username")
            try:
                target_user = User.objects.get(username=target_username)
                
                # Check if a chat already exists between these two
                existing_chat = Conversation.objects.filter(is_group=False, users=request.user).filter(users=target_user).first()
                if existing_chat:
                    return JsonResponse({"status": "success", "room_id": existing_chat.id})
                
                # Create new private chat
                new_chat = Conversation.objects.create(is_group=False)
                new_chat.users.add(request.user, target_user)
                return JsonResponse({"status": "success", "room_id": new_chat.id})
            
            except User.DoesNotExist:
                return JsonResponse({"status": "error", "message": "User not found."})

        elif chat_type == "channel":
            channel_name = data.get("channel_name")
            new_chat = Conversation.objects.create(is_group=True, group_name=channel_name)
            all_users = User.objects.all()
            new_chat.users.add(*all_users)  # add everyone automatically
            return JsonResponse({"status": "success", "room_id": new_chat.id})

    return JsonResponse({"status": "error", "message": "Invalid request."})

@login_required
def upload_image(request):
    if request.method == "POST" and request.FILES.get("image"):
        image_file = request.FILES["image"]
        room_id = request.POST.get("room_id")
        
        conversation = get_object_or_404(Conversation, id=room_id)
        
        # Save the message with the image attached
        msg = Message.objects.create(
            conversation=conversation,
            sender=request.user,
            content="🖼️ Image uploaded", 
            image=image_file
        )
        
        return JsonResponse({
            "status": "success", 
            "image_url": msg.image.url
        })
    return JsonResponse({"status": "error"})