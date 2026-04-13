from django.db import models
from django.contrib.auth.models import User
import random
import string
from django.utils import timezone

class Conversation(models.Model):
    is_group = models.BooleanField(default=False)
    group_name = models.CharField(max_length=128, null=True, blank=True)
    users = models.ManyToManyField(User, related_name="conversations")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        if self.is_group:
            return f"Channel: {self.group_name}"
        return f"Private Chat {self.id}"

    def get_last_message(self):
        return self.messages.order_by('-timestamp').first()

class Message(models.Model):
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="messages"
    )
    sender = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="messages_sent"
    )
    content = models.TextField()
    image = models.ImageField(upload_to="chat_images/", null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.sender.username}: {self.content[:20]}"
    
class OTPVerification(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="otp_verification")
    otp_code = models.CharField(max_length=6)
    created = models.DateTimeField(auto_now_add=True)
    is_verified = models.BooleanField(default=False)
    failed_attempts = models.IntegerField(default=0)

    def generate_otp(self):
        self.otp_code = ''.join(random.choices(string.digits, k=6))
        self.created = timezone.now()
        self.is_verified = False
        self.failed_attempts = 0
        self.save()
        return self.otp_code

    def is_expired(self):
        expiry_time = self.created + timezone.timedelta(minutes=10)
        return timezone.now() > expiry_time

    def verify_otp(self, entered_otp):
        if self.failed_attempts >= 5:
            return False
        if not self.is_expired() and self.otp_code == entered_otp and not self.is_verified:
            self.is_verified = True
            self.save()
            return True
        self.failed_attempts += 1
        self.save()
        return False

    def is_locked_out(self):
        return self.failed_attempts >= 5