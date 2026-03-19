from django.urls import path
from . import views

urlpatterns = [
    path("", views.app_view, name="app"),
    path("chat/<str:room_name>/", views.room, name="room"),
    path("login/", views.login_view),
    path("register/", views.register_view),
    path("logout/", views.logout_view),
    path("api/create-chat/", views.create_chat_api, name="create_chat"),
    path("api/upload-image/", views.upload_image, name="upload_image"),
]