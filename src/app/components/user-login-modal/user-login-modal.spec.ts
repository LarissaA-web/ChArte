import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserLoginModal } from './user-login-modal';

describe('UserLoginModal', () => {
  let component: UserLoginModal;
  let fixture: ComponentFixture<UserLoginModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserLoginModal],
    }).compileComponents();

    fixture = TestBed.createComponent(UserLoginModal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
