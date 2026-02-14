# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import factory
from uuid import uuid4
from django.utils import timezone

from plane.db.models import User, Workspace, WorkspaceMember, Project, ProjectMember, IssueType, ProjectIssueType, Issue, State


class UserFactory(factory.django.DjangoModelFactory):
    """Factory for creating User instances"""

    class Meta:
        model = User
        django_get_or_create = ("email",)

    id = factory.LazyFunction(uuid4)
    email = factory.Sequence(lambda n: f"user{n}@plane.so")
    password = factory.PostGenerationMethodCall("set_password", "password")
    first_name = factory.Sequence(lambda n: f"First{n}")
    last_name = factory.Sequence(lambda n: f"Last{n}")
    is_active = True
    is_superuser = False
    is_staff = False


class WorkspaceFactory(factory.django.DjangoModelFactory):
    """Factory for creating Workspace instances"""

    class Meta:
        model = Workspace
        django_get_or_create = ("slug",)

    id = factory.LazyFunction(uuid4)
    name = factory.Sequence(lambda n: f"Workspace {n}")
    slug = factory.Sequence(lambda n: f"workspace-{n}")
    owner = factory.SubFactory(UserFactory)
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class WorkspaceMemberFactory(factory.django.DjangoModelFactory):
    """Factory for creating WorkspaceMember instances"""

    class Meta:
        model = WorkspaceMember

    id = factory.LazyFunction(uuid4)
    workspace = factory.SubFactory(WorkspaceFactory)
    member = factory.SubFactory(UserFactory)
    role = 20  # Admin role by default
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class ProjectFactory(factory.django.DjangoModelFactory):
    """Factory for creating Project instances"""

    class Meta:
        model = Project
        django_get_or_create = ("name", "workspace")

    id = factory.LazyFunction(uuid4)
    name = factory.Sequence(lambda n: f"Project {n}")
    workspace = factory.SubFactory(WorkspaceFactory)
    created_by = factory.SelfAttribute("workspace.owner")
    updated_by = factory.SelfAttribute("workspace.owner")
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class ProjectMemberFactory(factory.django.DjangoModelFactory):
    """Factory for creating ProjectMember instances"""

    class Meta:
        model = ProjectMember

    id = factory.LazyFunction(uuid4)
    project = factory.SubFactory(ProjectFactory)
    member = factory.SubFactory(UserFactory)
    role = 20  # Admin role by default
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class IssueTypeFactory(factory.django.DjangoModelFactory):
    """Factory for creating IssueType instances"""

    class Meta:
        model = IssueType

    id = factory.LazyFunction(uuid4)
    name = factory.Sequence(lambda n: f"Issue Type {n}")
    description = ""
    logo_props = factory.LazyFunction(lambda: {"color": "#3B82F6"})
    is_default = False
    is_active = True
    level = 0
    workspace = factory.SubFactory(WorkspaceFactory)
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class ProjectIssueTypeFactory(factory.django.DjangoModelFactory):
    """Factory for creating ProjectIssueType instances"""

    class Meta:
        model = ProjectIssueType

    id = factory.LazyFunction(uuid4)
    issue_type = factory.SubFactory(IssueTypeFactory)
    project = factory.SubFactory(ProjectFactory)
    workspace = factory.LazyAttribute(lambda o: o.project.workspace)
    level = 0
    is_default = False
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class StateFactory(factory.django.DjangoModelFactory):
    """Factory for creating State instances"""

    class Meta:
        model = State

    id = factory.LazyFunction(uuid4)
    name = factory.Sequence(lambda n: f"State {n}")
    group = "backlog"
    project = factory.SubFactory(ProjectFactory)
    workspace = factory.LazyAttribute(lambda o: o.project.workspace)
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class IssueFactory(factory.django.DjangoModelFactory):
    """Factory for creating Issue instances"""

    class Meta:
        model = Issue

    id = factory.LazyFunction(uuid4)
    name = factory.Sequence(lambda n: f"Issue {n}")
    project = factory.SubFactory(ProjectFactory)
    workspace = factory.LazyAttribute(lambda o: o.project.workspace)
    state = factory.SubFactory(StateFactory, project=factory.SelfAttribute("..project"), workspace=factory.SelfAttribute("..workspace"))
    created_by = factory.LazyAttribute(lambda o: o.project.created_by)
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class PropertyDefinitionFactory(factory.django.DjangoModelFactory):
    """Factory for creating IssuePropertyDefinition instances"""

    class Meta:
        model = "hw.IssuePropertyDefinition"

    id = factory.LazyFunction(uuid4)
    name = factory.Sequence(lambda n: f"Property {n}")
    property_type = "text"
    options = factory.LazyFunction(list)
    is_required = False
    sort_order = 65535
    workspace = factory.SubFactory(WorkspaceFactory)
    issue_type = None  # Universal by default
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class PropertyValueFactory(factory.django.DjangoModelFactory):
    """Factory for creating IssuePropertyValue instances"""

    class Meta:
        model = "hw.IssuePropertyValue"

    id = factory.LazyFunction(uuid4)
    issue = factory.SubFactory(IssueFactory)
    property_definition = factory.SubFactory(PropertyDefinitionFactory)
    value = factory.LazyFunction(lambda: {"value": "test"})
    workspace = factory.LazyAttribute(lambda o: o.issue.workspace)
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)
